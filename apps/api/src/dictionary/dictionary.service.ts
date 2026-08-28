import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import type { DictionarySense } from '@auto-learn/shared';

export interface RetrievedWord {
  word: string;
  senses: DictionarySense[];
  synonyms: string[];
}

/**
 * Three outcomes, not two.
 *
 * "The dictionary has no entry for this" and "the dictionary did not answer"
 * used to arrive here as the same empty list, and the reader was told
 * `I couldn't find "substantial", so I won't guess at what it means` — about a
 * word with nine entries, while the service was simply unreachable. That is a
 * false statement dressed as caution, and it sends someone off to doubt their
 * own vocabulary.
 */
export type Retrieval =
  | { status: 'found'; entry: RetrievedWord }
  | { status: 'absent' }
  | { status: 'unavailable' };

const DICTIONARY_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const DATAMUSE_URL = 'https://api.datamuse.com/words';

/**
 * Per attempt, and there are two.
 *
 * Longer than the 2.5s this used to allow, because by the time a lookup runs
 * the reader has already opened a gate and would rather wait than be told
 * their word does not exist. Still far inside the card call's own budget.
 */
const TIMEOUT_MS = 5_000;

@Injectable()
export class DictionaryService {
  private readonly logger = new Logger(DictionaryService.name);

  /**
   * Caching the *retrieval* is the reliable win. Academic vocabulary repeats
   * heavily across users, this saves two network round trips per card, and
   * unlike the generated card it is keyed by something we know before we call
   * anything. Nothing here is user-specific, so cross-user sharing is safe.
   */
  // Wrapped in an object because LRUCache values must extend `{}` — a bare
  // null cannot be stored, and misses are exactly what we most want to cache
  // (see the timeout note below).
  private readonly cache = new LRUCache<
    string,
    { value: RetrievedWord | null }
  >({
    max: 10_000,
    ttl: 24 * 60 * 60 * 1000,
  });

  async lookup(word: string): Promise<Retrieval> {
    const key = word.toLowerCase();

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached.value
        ? { status: 'found', entry: cached.value }
        : { status: 'absent' };
    }

    // Both start together, as they always have — two round trips in sequence
    // is a second of waiting for nothing. `fetchSynonyms` never rejects, so
    // leaving it in flight on the failure path below is safe.
    const pendingSenses = this.fetchSenses(key);
    const pendingSynonyms = this.fetchSynonyms(key);

    let senses: DictionarySense[];
    try {
      senses = await pendingSenses;
    } catch (error) {
      // Deliberately not cached. Caching this would take a thirty-second
      // outage and turn it into twenty-four hours of telling everyone that a
      // real word does not exist.
      this.logger.warn(`dictionary unreachable for "${key}"`, error);
      return { status: 'unavailable' };
    }

    // Synonyms are optional by design — the prompt says to supply your own when
    // none arrive — so their failure is not the lookup's failure.
    const synonyms = await pendingSynonyms;

    const entry = senses.length > 0 ? { word: key, senses, synonyms } : null;
    this.cache.set(key, { value: entry });
    return entry ? { status: 'found', entry } : { status: 'absent' };
  }

  /**
   * Free Dictionary returns Wiktionary-flavoured prose — "substantial" comes
   * back as "Corporeal; material; firm." That is accurate and useless to a
   * learner, which is exactly why the model's job is to *select* one of these
   * senses and paraphrase it, rather than to invent a definition or to parrot
   * this text back.
   */
  /**
   * Throws when the dictionary cannot be reached. Returns an empty list only
   * when it answered and had nothing — the caller depends on the difference.
   */
  private async fetchSenses(word: string): Promise<DictionarySense[]> {
    const url = `${DICTIONARY_URL}/${encodeURIComponent(word)}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      // One retry. This endpoint is slow before it is down: a cold entry has
      // been measured at twenty seconds, so a single miss is more often a
      // slow start than an outage.
      response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    }

    // 404 is the ordinary "no entry" answer here, not a failure. A 5xx is.
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`dictionary responded ${response.status}`);
    }

    try {
      const payload = (await response.json()) as DictionaryApiEntry[];
      if (!Array.isArray(payload)) return [];

      const senses: DictionarySense[] = [];
      for (const entry of payload) {
        for (const meaning of entry.meanings ?? []) {
          for (const definition of meaning.definitions ?? []) {
            if (!definition.definition) continue;
            senses.push({
              senseId: `s${senses.length}`,
              partOfSpeech: meaning.partOfSpeech ?? 'other',
              definition: definition.definition,
              example: definition.example,
            });
          }
        }
      }

      // A long tail of near-duplicate archaic senses only makes the choice
      // harder and the prompt more expensive.
      return senses.slice(0, 12);
    } catch (error) {
      // A body that answered but did not parse is not an outage: there is
      // nothing to retry and nothing to say about the word.
      this.logger.warn(`dictionary payload unreadable for "${word}"`, error);
      return [];
    }
  }

  private async fetchSynonyms(word: string): Promise<string[]> {
    try {
      const response = await fetch(
        `${DATAMUSE_URL}?rel_syn=${encodeURIComponent(word)}&max=12`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!response.ok) return [];

      const payload = (await response.json()) as Array<{ word?: string }>;
      if (!Array.isArray(payload)) return [];

      return payload
        .map((item) => item.word)
        .filter((value): value is string => Boolean(value));
    } catch (error) {
      this.logger.warn(`synonym lookup failed for "${word}"`, error);
      return [];
    }
  }
}

interface DictionaryApiEntry {
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string; example?: string }>;
  }>;
}
