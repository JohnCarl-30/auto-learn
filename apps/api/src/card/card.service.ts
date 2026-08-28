import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';
import {
  ModelCard,
  type ApiError,
  type CardRequest,
  type CardResponse,
  type DictionarySense,
  type GatedSuggestionType,
} from '@auto-learn/shared';
import {
  CARD_MAX_OUTPUT_TOKENS,
  CARD_MODEL,
  CARD_TIMEOUT_MS,
  MODEL_MAX_RETRIES,
  cardModel,
  cardProviderOptions,
} from '../llm/models';
import { CARD_SYSTEM_PROMPT, cardUserPrompt } from '../llm/prompts';
import { DictionaryService } from '../dictionary/dictionary.service';
import { SessionStore } from '../session/session.store';
import { TelemetryService } from '../telemetry/telemetry.service';

/** The cache only ever holds full cards; grammar notes are built on the spot. */
type CardVariant = Extract<CardResponse, { kind: 'card' }>;

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

  async build(request: CardRequest): Promise<CardResponse> {
    const target = this.resolveTarget(request);

    // A grammar gate costs nothing extra. /propose already wrote the
    // in-context reason — that one line *is* what a grammar fix has to teach,
    // so there is no dictionary lookup and no second model call. It also
    // returns a note rather than a card, so nothing lands in the word bank: a
    // corrected verb is not vocabulary the writer learned.
    if (target.suggestionType === 'grammar') {
      this.telemetry.noteOpened();
      return {
        kind: 'note',
        note: {
          corrected: target.word,
          note: target.reason ?? 'Grammatical correction.',
        },
        replacement: target.replacement,
        alternative: null,
      };
    }

    // Intent, counted before anything can fail: the reader clicked.
    this.telemetry.cardRequested();
    if (target.kind === 'lookup') this.telemetry.lookup();

    try {
      const response = await this.buildCard(target);
      this.telemetry.cardDelivered();
      return response;
    } catch (error) {
      // Counted separately so a flaky model cannot masquerade as engagement.
      this.telemetry.cardFailed();
      throw error;
    }
  }

  private async buildCard(
    target: ReturnType<CardService['resolveTarget']>,
  ): Promise<CardVariant> {
    const key = cacheKey(target.word, target.sentence);

    const cached = this.cache.get(key);
    if (cached) {
      // A cached card still has to release the right replacement: the same
      // word can be cached from a lookup (null) and later opened as a gate.
      return { ...cached, replacement: target.replacement };
    }

    const retrieved = await this.dictionary.lookup(target.word);
    if (!retrieved) {
      throw this.fail(
        'no_dictionary_entry',
        `I couldn't find "${target.word}" in the dictionary, so I won't guess at what it means.`,
      );
    }

    const generated = await this.callModel(
      target.word,
      target.sentence,
      retrieved.senses,
      retrieved.synonyms,
      target.reason,
    );

    // Guard the grounding claim: if the model returned a senseId we did not
    // supply, the card is not actually dictionary-backed.
    const chosen = retrieved.senses.find(
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
        word: target.word,
        lemma: retrieved.word,
        partOfSpeech: generated.partOfSpeech,
        definition: generated.definition,
        senseId: generated.senseId,
        synonyms: generated.synonyms,
        useCases: generated.useCases,
        register: generated.register,
        whyHere: target.kind === 'lookup' ? null : generated.whyHere,
      },
      replacement: target.replacement,
      alternative: generated.alternative,
    };

    this.cache.set(key, { ...response, replacement: null });
    return response;
  }

  /**
   * Works out which word the card is about.
   *
   * For a gated suggestion that is the *replacement* — the word being
   * introduced is the one worth learning, not the one being replaced.
   */
  private resolveTarget(request: CardRequest): {
    word: string;
    sentence: string;
    replacement: string | null;
    reason: string | null;
    kind: CardRequest['kind'];
    suggestionType: GatedSuggestionType | null;
  } {
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
        word: found.suggestion.replacement,
        sentence: found.sentence.text,
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
