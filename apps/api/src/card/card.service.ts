import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateObject, streamObject, type DeepPartial } from 'ai';
import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';
import {
  CardStreamEvent,
  ModelCard,
  PartOfSpeech,
  wordToTeach,
  type ApiError,
  type CardRequest,
  type CardResponse,
  type DictionarySense,
  type GatedSuggestionType,
  type Pronunciation,
} from '@auto-learn/shared';
import {
  CARD_MAX_OUTPUT_TOKENS,
  CARD_MODEL,
  CARD_TIMEOUT_MS,
  MODEL_MAX_RETRIES,
  cardModel,
  cardProviderOptions,
} from '../llm/models';
import type { RetrievedWord } from '../dictionary/dictionary.service';
import { CARD_SYSTEM_PROMPT, cardUserPrompt } from '../llm/prompts';
import { DictionaryService } from '../dictionary/dictionary.service';
import { SessionStore } from '../session/session.store';
import { TelemetryService } from '../telemetry/telemetry.service';

/** The cache only ever holds full cards; grammar notes are built on the spot. */
type CardVariant = Extract<CardResponse, { kind: 'card' }>;

/** Which word the card is about, and what opening it releases. */
interface Target {
  word: string;
  sentence: string;
  replacement: string | null;
  reason: string | null;
  kind: CardRequest['kind'];
  suggestionType: GatedSuggestionType | null;
}

/**
 * The outcome of everything that can be decided before the model runs.
 *
 * `ready` covers a grammar note and a cache hit — both are answers already, and
 * both routes return them without generating anything.
 */
export type Prepared =
  | { kind: 'ready'; response: CardResponse }
  | {
      kind: 'generate';
      target: Target;
      entry: RetrievedWord;
      key: string;
      sound: Promise<Pronunciation>;
    };

/** The half-written card `partialObjectStream` hands back. */
type PartialCard = DeepPartial<ModelCard>;

@Injectable()
export class CardService {
  private readonly logger = new Logger(CardService.name);

  /**
   * The plan called for keying this by word + senseId. That cannot work: the
   * sense is chosen *by* the model, using the sentence, so it is unknown until
   * after the call we are trying to avoid. Keying on word + sentence is the
   * honest version — it makes re-opening a card free (common: open, close,
   * reopen) and still shares across users who write the same phrase, which for
   * stock academic sentences is not rare.
   */
  private readonly cache = new LRUCache<string, CardVariant>({
    max: 5_000,
    ttl: 24 * 60 * 60 * 1000,
  });

  constructor(
    private readonly sessions: SessionStore,
    private readonly dictionary: DictionaryService,
    private readonly telemetry: TelemetryService,
  ) {}

  /**
   * Everything that can refuse the request, and everything already known.
   *
   * Split out because the streaming route has to run all of it while it can
   * still send a status code: an expired session, a word the dictionary does
   * not carry, a grammar gate that needs no model call at all. Once the first
   * byte of an NDJSON body is out, none of those can be a status any more.
   *
   * Returns a finished response when there is nothing to generate — a note, or
   * a card already in the cache — so both routes handle that the same way.
   */
  async prepare(request: CardRequest): Promise<Prepared> {
    const target = this.resolveTarget(request);

    // A grammar gate costs nothing extra. /propose already wrote the
    // in-context reason — that one line *is* what a grammar fix has to teach,
    // so there is no dictionary lookup and no second model call. It also
    // returns a note rather than a card, so nothing lands in the word bank: a
    // corrected verb is not vocabulary the writer learned.
    if (target.suggestionType === 'grammar') {
      this.telemetry.noteOpened();
      return {
        kind: 'ready',
        response: {
          kind: 'note',
          note: {
            corrected: target.word,
            note: target.reason ?? 'Grammatical correction.',
          },
          replacement: target.replacement,
          alternative: null,
        },
      };
    }

    // Intent, counted before anything can fail: the reader clicked.
    this.telemetry.cardRequested();
    if (target.kind === 'lookup') this.telemetry.lookup();

    const key = cacheKey(target.word, target.sentence);
    const cached = this.cache.get(key);
    if (cached) {
      // A cached card still has to release the right replacement: the same
      // word can be cached from a lookup (null) and later opened as a gate.
      this.telemetry.cardDelivered();
      return {
        kind: 'ready',
        response: { ...cached, replacement: target.replacement },
      };
    }

    const retrieved = await this.dictionary.lookup(target.word);

    // Two different failures, and telling them apart is the whole point of the
    // distinction: one is about the word, the other is about us.
    if (retrieved.status === 'unavailable') {
      this.telemetry.cardFailed();
      throw this.fail(
        'upstream_failed',
        "I couldn't reach the dictionary just now. Try that word again in a moment.",
      );
    }

    if (retrieved.status === 'absent') {
      this.telemetry.cardFailed();
      throw this.fail(
        'no_dictionary_entry',
        `I couldn't find "${target.word}" in the dictionary, so I won't guess at what it means.`,
      );
    }

    return {
      kind: 'generate',
      target,
      entry: retrieved.entry,
      key,
      // Started here and awaited at assembly. It comes from a different source
      // over the network, and the generation about to run takes several
      // seconds — long enough to cover it for free.
      sound: this.dictionary.pronunciation(target.word),
    };
  }

  async build(request: CardRequest): Promise<CardResponse> {
    const prepared = await this.prepare(request);
    if (prepared.kind === 'ready') return prepared.response;

    try {
      const generated = await this.callModel(
        prepared.target.word,
        prepared.target.sentence,
        prepared.entry.senses,
        prepared.entry.synonyms,
        prepared.target.reason,
      );
      const response = await this.assemble(prepared, generated);
      this.telemetry.cardDelivered();
      return response;
    } catch (error) {
      // Counted separately so a flaky model cannot masquerade as engagement.
      this.telemetry.cardFailed();
      throw error;
    }
  }

  /**
   * The same card, sent as the model writes it.
   *
   * A card takes between four and thirteen seconds, and the reader watches
   * skeletons for all of it — while the definition, which is the line they
   * clicked for, is finished long before the examples are.
   *
   * Nothing is withheld here the way it is on /propose: by this point the gate
   * has opened. What still holds is that the events are a preview — nothing is
   * built from them, `done` carries the same payload `build` returns, and a
   * client that ignored every preview would be correct.
   */
  async *stream(
    prepared: Prepared,
    /** Aborted when the reader closes the card, so an abandoned one stops billing. */
    abandoned?: AbortSignal,
  ): AsyncGenerator<CardStreamEvent> {
    if (prepared.kind === 'ready') {
      yield { kind: 'done', response: prepared.response };
      return;
    }

    try {
      const result = streamObject({
        model: cardModel(),
        schema: ModelCard,
        system: CARD_SYSTEM_PROMPT,
        prompt: cardUserPrompt({
          word: prepared.target.word,
          sentence: prepared.target.sentence,
          senses: prepared.entry.senses,
          synonyms: prepared.entry.synonyms,
          reason: prepared.target.reason,
        }),
        providerOptions: cardProviderOptions,
        maxOutputTokens: CARD_MAX_OUTPUT_TOKENS,
        maxRetries: MODEL_MAX_RETRIES,
        abortSignal: abandoned
          ? AbortSignal.any([abandoned, AbortSignal.timeout(CARD_TIMEOUT_MS)])
          : AbortSignal.timeout(CARD_TIMEOUT_MS),
      });

      const sent = { definition: false, synonyms: 0, examples: 0 };
      for await (const partial of result.partialObjectStream) {
        yield* this.preview(prepared, partial, sent);
      }

      const generated = await result.object;
      this.telemetry.spend(CARD_MODEL, await result.usage);
      const response = await this.assemble(prepared, generated);
      this.telemetry.cardDelivered();
      yield { kind: 'done', response };
    } catch (error) {
      if (abandoned?.aborted) return;

      this.telemetry.cardFailed();
      this.logger.error(
        `card stream failed for "${prepared.target.word}"`,
        error as Error,
      );
      yield {
        kind: 'error',
        error:
          error instanceof HttpException
            ? (error.getResponse() as ApiError)
            : { code: 'upstream_failed', message: 'Could not build the card.' },
      };
    }
  }

  /**
   * Turns a half-written card into events that are safe to send.
   *
   * Same rule as the propose stream: a field is only trustworthy once the
   * *next* one has begun, JSON being written in order. The senseId is checked
   * before anything at all is sent — it is the first field generated, and the
   * senses on offer are already known, so a card grounded in a sense we never
   * supplied is caught before the reader has been shown a definition for it.
   */
  private *preview(
    prepared: Extract<Prepared, { kind: 'generate' }>,
    partial: PartialCard,
    sent: { definition: boolean; synonyms: number; examples: number },
  ): Generator<CardStreamEvent> {
    // `partOfSpeech` having begun is what proves `senseId` is finished.
    if (
      typeof partial.senseId !== 'string' ||
      partial.partOfSpeech === undefined
    ) {
      return;
    }
    const grounded = prepared.entry.senses.some(
      (sense) => sense.senseId === partial.senseId,
    );
    if (!grounded) return;

    if (!sent.definition) {
      const partOfSpeech = PartOfSpeech.safeParse(partial.partOfSpeech);
      // `synonyms` having begun is what proves `definition` is finished.
      if (
        partOfSpeech.success &&
        typeof partial.definition === 'string' &&
        partial.synonyms !== undefined
      ) {
        sent.definition = true;
        yield {
          kind: 'definition',
          word: prepared.target.word,
          partOfSpeech: partOfSpeech.data,
          definition: partial.definition,
        };
      }
    }
    if (!sent.definition) return;

    const synonyms = partial.synonyms ?? [];
    // The last element is only closed once the next field has started.
    const settledSynonyms =
      partial.useCases !== undefined ? synonyms.length : synonyms.length - 1;
    for (; sent.synonyms < settledSynonyms; sent.synonyms++) {
      const synonym = synonyms[sent.synonyms];
      if (!synonym?.word || typeof synonym.nuance !== 'string') return;
      yield { kind: 'synonym', word: synonym.word, nuance: synonym.nuance };
    }

    const useCases = partial.useCases ?? [];
    const settledExamples =
      partial.register !== undefined ? useCases.length : useCases.length - 1;
    for (; sent.examples < settledExamples; sent.examples++) {
      const text = useCases[sent.examples];
      if (typeof text !== 'string') return;
      yield { kind: 'example', text };
    }
  }

  /**
   * Turns the model's object into the response, and guards the grounding
   * claim: if it returned a senseId we did not supply, the card is not
   * actually dictionary-backed.
   */
  private async assemble(
    prepared: Extract<Prepared, { kind: 'generate' }>,
    generated: ModelCard,
  ): Promise<CardVariant> {
    const chosen = prepared.entry.senses.find(
      (sense) => sense.senseId === generated.senseId,
    );
    if (!chosen) {
      throw this.fail(
        'upstream_failed',
        'The model picked a meaning that was not on offer.',
      );
    }

    const response: CardVariant = {
      kind: 'card',
      card: {
        word: prepared.target.word,
        lemma: prepared.entry.word,
        partOfSpeech: generated.partOfSpeech,
        definition: generated.definition,
        senseId: generated.senseId,
        synonyms: generated.synonyms,
        useCases: generated.useCases,
        register: generated.register,
        whyHere: prepared.target.kind === 'lookup' ? null : generated.whyHere,
        // Word-derived, not request-derived — so unlike `replacement` below,
        // this is safe to keep on the cached variant and needs no re-stitching
        // when the next reader meets the same word in a different sentence.
        pronunciation: await prepared.sound,
      },
      replacement: prepared.target.replacement,
      alternative: generated.alternative,
    };

    this.cache.set(prepared.key, { ...response, replacement: null });
    return response;
  }

  /**
   * Works out which word the card is about.
   *
   * For a gated suggestion that is the *replacement* — the word being
   * introduced is the one worth learning, not the one being replaced.
   */
  private resolveTarget(request: CardRequest): Target {
    if (request.kind === 'suggestion') {
      const found = this.sessions.findSuggestion(
        request.sessionId,
        request.suggestionId,
      );
      if (!found) {
        throw this.fail(
          'suggestion_not_found',
          'That suggestion has expired. Submit the sentence again.',
        );
      }
      return {
        // The word, not the span. A gate may cover a phrase — "big effect"
        // becomes "significant effect" — and a dictionary has entries for
        // words. Looking up the phrase produced a marker the reader could
        // click and nothing could answer.
        word: wordToTeach(
          found.suggestion.original,
          found.suggestion.replacement,
        ),
        sentence: found.sentence.text,
        // Unchanged: what gets spliced into the sentence is still the whole
        // replacement. Only the card's subject narrows.
        replacement: found.suggestion.replacement,
        reason: found.suggestion.reason,
        kind: 'suggestion',
        suggestionType: found.suggestion.type,
      };
    }

    const sentence = this.sessions.findSentence(
      request.sessionId,
      request.sentenceIndex,
    );
    if (!sentence) {
      throw this.fail('session_not_found', 'That session has expired.');
    }

    if (!sentence.text.toLowerCase().includes(request.word.toLowerCase())) {
      throw this.fail(
        'word_not_in_sentence',
        'That word is not in this sentence.',
      );
    }

    return {
      word: request.word,
      sentence: sentence.text,
      replacement: null,
      reason: null,
      kind: 'lookup',
      suggestionType: null,
    };
  }

  private async callModel(
    word: string,
    sentence: string,
    senses: DictionarySense[],
    synonyms: string[],
    reason: string | null,
  ) {
    const prompt = cardUserPrompt({ word, sentence, senses, synonyms, reason });

    try {
      const { object, usage } = await generateObject({
        model: cardModel(),
        schema: ModelCard,
        system: CARD_SYSTEM_PROMPT,
        prompt,
        providerOptions: cardProviderOptions,
        maxOutputTokens: CARD_MAX_OUTPUT_TOKENS,
        maxRetries: MODEL_MAX_RETRIES,
        abortSignal: AbortSignal.timeout(CARD_TIMEOUT_MS),
      });
      this.telemetry.spend(CARD_MODEL, usage);
      return object;
    } catch (error) {
      this.logger.error(`card call failed for "${word}"`, error as Error);
      throw this.fail('upstream_failed', 'Could not build the card.');
    }
  }

  private fail(code: ApiError['code'], message: string): HttpException {
    const status =
      code === 'upstream_failed'
        ? HttpStatus.BAD_GATEWAY
        : code === 'no_dictionary_entry'
          ? HttpStatus.UNPROCESSABLE_ENTITY
          : HttpStatus.BAD_REQUEST;
    return new HttpException({ code, message } satisfies ApiError, status);
  }
}

function cacheKey(word: string, sentence: string): string {
  return createHash('sha256')
    .update(`${word.toLowerCase()}|${sentence.trim()}`)
    .digest('hex');
}
