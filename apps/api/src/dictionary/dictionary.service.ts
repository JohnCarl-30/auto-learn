import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import type { DictionarySense, Pronunciation } from '@auto-learn/shared';
import { pickPronunciation, type PhoneticSource } from './phonetics';

export interface RetrievedWord {
  word: string;
  senses: DictionarySense[];
  synonyms: string[];
  /**
   * Rides along with the senses at no cost — Free Dictionary returns it in the
   * same response we were already making, and we were discarding it. No extra
   * request, no extra latency, and the cache below covers it for free.
   */
  pronunciation: Pronunciation;
}

const NOTHING_HEARD: Pronunciation = { ipa: null, audioUrl: null };

const DICTIONARY_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const DATAMUSE_URL = 'https://api.datamuse.com/words';

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

  async lookup(word: string): Promise<RetrievedWord | null> {
    const key = word.toLowerCase();

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached.value;

    const [entry, synonyms] = await Promise.all([
      this.fetchEntry(key),
      this.fetchSynonyms(key),
    ]);

    const result =
      entry.senses.length > 0
        ? {
            word: key,
            senses: entry.senses,
            synonyms,
            pronunciation: entry.pronunciation,
          }
        : null;
    this.cache.set(key, { value: result });
    return result;
  }

  /**
   * Free Dictionary returns Wiktionary-flavoured prose — "substantial" comes
   * back as "Corporeal; material; firm." That is accurate and useless to a
   * learner, which is exactly why the model's job is to *select* one of these
   * senses and paraphrase it, rather than to invent a definition or to parrot
   * this text back.
   */
  private async fetchEntry(
    word: string,
  ): Promise<{ senses: DictionarySense[]; pronunciation: Pronunciation }> {
    try {
      const response = await fetch(
        `${DICTIONARY_URL}/${encodeURIComponent(word)}`,
        { signal: AbortSignal.timeout(2_500) },
      );

      // 404 is the ordinary "no entry" answer here, not a failure. So is a
      // 502, which this API returns intermittently — and which arrives as
      // plain text, so parsing it as JSON would throw rather than degrade.
      if (!response.ok) return { senses: [], pronunciation: NOTHING_HEARD };

      const payload = (await response.json()) as DictionaryApiEntry[];
      if (!Array.isArray(payload)) {
        return { senses: [], pronunciation: NOTHING_HEARD };
      }

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

      return {
        // A long tail of near-duplicate archaic senses only makes the choice
        // harder and the prompt more expensive.
        senses: senses.slice(0, 12),
        pronunciation: pickPronunciation(payload),
      };
    } catch (error) {
      this.logger.warn(`dictionary lookup failed for "${word}"`, error);
      return { senses: [], pronunciation: NOTHING_HEARD };
    }
  }

  private async fetchSynonyms(word: string): Promise<string[]> {
    try {
      const response = await fetch(
        `${DATAMUSE_URL}?rel_syn=${encodeURIComponent(word)}&max=12`,
        { signal: AbortSignal.timeout(2_500) },
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

interface DictionaryApiEntry extends PhoneticSource {
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string; example?: string }>;
  }>;
}
