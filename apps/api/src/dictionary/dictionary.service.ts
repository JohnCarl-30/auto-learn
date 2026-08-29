import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import type { Pronunciation } from '@auto-learn/shared';
import { pickPronunciation, type PhoneticSource } from './phonetics';
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
 */
export type Retrieval =
  | { status: 'found'; entry: RetrievedWord }
  | { status: 'absent' }
  | { status: 'unavailable' };

const DICTIONARY_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const NOTHING_HEARD: Pronunciation = { ipa: null, audioUrl: null };

/**
 * Two sources, and which is which is the whole design.
 *
 * Senses come from WordNet, on local disk, because a card cannot be written
 * without them — the grounding *is* the anti-hallucination mechanism, and when
 * that lookup went over the network an outage meant no cards at all.
 *
 * Pronunciation comes from Free Dictionary, over the network, because it can
 * be missing without costing the reader the card. Words the dictionary has a
 * recording for get a real human voice for free; the rest fall through to
 * synthesis. The network sits where its failure is cosmetic, which is the
 * lesson the sense lookup taught the expensive way.
 */
@Injectable()
export class DictionaryService {
  private readonly logger = new Logger(DictionaryService.name);

  private readonly cache = new LRUCache<
    string,
    { value: RetrievedWord | null }
  >({ max: 10_000, ttl: 24 * 60 * 60 * 1000 });

  /** Separate, because it is filled from a different source that may not answer. */
  private readonly sounds = new LRUCache<string, Pronunciation>({
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

  /**
   * Best effort, and it never throws.
   *
   * Every failure here is silence — no IPA, no recording — and silence is
   * exactly what the card already handles: it falls back to synthesis, which
   * is what it does for the many words that have no recording anyway. Nothing
   * a reader sees depends on this arriving, so nothing about it is allowed to
   * fail a request.
   *
   * Start it before the model call and await it after; it costs no wall clock
   * that the generation was not already spending.
   */
  async pronunciation(word: string): Promise<Pronunciation> {
    const key = word.toLowerCase();

    const cached = this.sounds.get(key);
    if (cached !== undefined) return cached;

    try {
      const response = await fetch(
        `${DICTIONARY_URL}/${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(2_500) },
      );

      // 404 is a real answer — this word has no recording — and worth keeping.
      if (response.status === 404) {
        this.sounds.set(key, NOTHING_HEARD);
        return NOTHING_HEARD;
      }

      // Anything else says nothing about the word, so it is not cached: a
      // thirty-second outage should not mute a word for a day.
      if (!response.ok) return NOTHING_HEARD;

      const payload = (await response.json()) as PhoneticSource[];
      if (!Array.isArray(payload)) return NOTHING_HEARD;

      const heard = pickPronunciation(payload);
      this.sounds.set(key, heard);
      return heard;
    } catch (error) {
      this.logger.warn(`no pronunciation for "${key}"`, error);
      return NOTHING_HEARD;
    }
  }
}
