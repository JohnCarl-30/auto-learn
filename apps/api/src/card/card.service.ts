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
} from '@auto-learn/shared';
import { cardModel, cardProviderOptions } from '../llm/models';
import { DictionaryService } from '../dictionary/dictionary.service';
import { SessionStore } from '../session/session.store';

const SYSTEM_PROMPT = `You write vocabulary cards for university students writing academic English as a second language.

You are given a sentence, a target word, and a list of candidate dictionary senses. Your job:

1. Choose the senseId that actually fits the word as used in this sentence. Choose from the list — never invent a sense.
2. Rewrite that sense as a definition a B2-level learner can read. Do not copy the dictionary wording, which is often archaic. Plain, current English.
3. Give 2-3 synonyms. Prefer the supplied candidates. For each, say in a few words how it differs from the target word — that difference is the whole point, so "similar meaning" is a useless answer.
4. Give exactly 2 example sentences showing the word in academic writing. Do not reuse the user's sentence.
5. Label the register: formal, neutral, or informal.
6. "whyHere": one short line on why this word suits this sentence. Null if no change was proposed.
7. "alternative": one other word the writer could reasonably use instead, or null.

Be accurate over impressive. A learner cannot tell when you are wrong.`;

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
  private readonly cache = new LRUCache<string, CardResponse>({
    max: 5_000,
    ttl: 24 * 60 * 60 * 1000,
  });

  constructor(
    private readonly sessions: SessionStore,
    private readonly dictionary: DictionaryService,
  ) {}

  async build(request: CardRequest): Promise<CardResponse> {
    const target = this.resolveTarget(request);
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

    const response: CardResponse = {
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
    };
  }

  private async callModel(
    word: string,
    sentence: string,
    senses: DictionarySense[],
    synonyms: string[],
    reason: string | null,
  ) {
    const senseList = senses
      .map((s) => `- ${s.senseId} (${s.partOfSpeech}): ${s.definition}`)
      .join('\n');

    const prompt = [
      `Sentence: ${sentence}`,
      `Target word: ${word}`,
      reason ? `Why it was proposed: ${reason}` : 'No change was proposed.',
      '',
      'Candidate senses:',
      senseList,
      '',
      synonyms.length
        ? `Candidate synonyms: ${synonyms.join(', ')}`
        : 'No synonym candidates were found; supply your own.',
    ].join('\n');

    try {
      const { object } = await generateObject({
        model: cardModel(),
        schema: ModelCard,
        system: SYSTEM_PROMPT,
        prompt,
        providerOptions: cardProviderOptions,
        maxOutputTokens: 1200,
      });
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
