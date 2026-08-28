import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { lookupWord, type RetrievedWord } from './wordnet';

export type { RetrievedWord };

/**
 * Three outcomes, not two.
 *
 * "WordNet has no entry for this" and "the lookup did not work" are different
 * facts, and collapsing them told a reader `I couldn't find "substantial", so
 * I won't guess at what it means` about a word with six entries — a false
 * statement dressed as caution, which sends someone off to doubt their own
 * vocabulary.
 *
 * `unavailable` is now rare rather than routine: the source moved on disk, so
 * reaching it fails only when the install is broken. It stays because "rare"
 * and "impossible" are different, and the day it happens the message should
 * still be honest.
 */
export type Retrieval =
  | { status: 'found'; entry: RetrievedWord }
  | { status: 'absent' }
  | { status: 'unavailable' };

@Injectable()
export class DictionaryService {
  private readonly logger = new Logger(DictionaryService.name);

  /**
   * Still cached, though the reason has changed.
   *
   * It used to save two network round trips. A local read is already under a
   * millisecond, so this now only saves parsing and allocation on the words
   * that repeat — which, for academic vocabulary, is most of them. Small, and
   * no longer load-bearing.
   */
  private readonly cache = new LRUCache<
    string,
    { value: RetrievedWord | null }
  >({ max: 10_000, ttl: 24 * 60 * 60 * 1000 });

  async lookup(word: string): Promise<Retrieval> {
    const key = word.toLowerCase();

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached.value
        ? { status: 'found', entry: cached.value }
        : { status: 'absent' };
    }

    let entry: RetrievedWord | null;
    try {
      entry = await lookupWord(key);
    } catch (error) {
      // Deliberately not cached. A failure held for a day would outlive
      // whatever caused it by a very long way.
      this.logger.error(`WordNet unreadable for "${key}"`, error as Error);
      return { status: 'unavailable' };
    }

    this.cache.set(key, { value: entry });
    return entry ? { status: 'found', entry } : { status: 'absent' };
  }
}
