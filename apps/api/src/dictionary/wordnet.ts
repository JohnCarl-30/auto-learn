import WordPOS from 'wordpos';
import type { WordPosResult } from 'wordpos';
import type { DictionarySense } from '@auto-learn/shared';

export interface RetrievedWord {
  word: string;
  senses: DictionarySense[];
  synonyms: string[];
}

/**
 * WordNet, read off local disk.
 *
 * This replaced two HTTP calls to services nobody here operates. The one that
 * supplied the senses was unreachable for the length of an e2e run, and while
 * it was down the product could not deliver a single card — the artifact it
 * exists to produce. Grounding is the anti-hallucination mechanism, so
 * "generate without it" was never an option; the only real fix was to stop
 * depending on someone else's uptime for it.
 *
 * The exchange is a 36MB dependency for a lookup that takes under a
 * millisecond, no timeout, no retry, no cache-poisoning failure mode, and no
 * outage class at all. WordNet's own licence permits this, commercially,
 * provided it is credited — see NOTICE.
 *
 * It is also a better source for this product than the one it replaces. The
 * old dictionary had no "deal with a problem" sense of "address" at all, which
 * an eval case had to be written around; WordNet has it. It returns modern
 * glosses rather than Wiktionary's archaic ones — "substantial" came back as
 * "Corporeal; material; firm." — and it carries synonyms per sense, which
 * retired the second network call along with the first.
 */
const wordpos = new WordPOS();

/**
 * WordNet's parts of speech, in its own notation.
 *
 * 's' is an adjective satellite — an adjective that only exists relative to a
 * head adjective, like "sturdy" hanging off "strong". The distinction is real
 * lexicography and means nothing to a learner, so both arrive as "adjective".
 */
const PARTS_OF_SPEECH: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  a: 'adjective',
  s: 'adjective',
  r: 'adverb',
};

/** A long tail of senses makes the model's choice harder and the prompt dearer. */
const MAX_SENSES = 12;

/**
 * Takes the cap evenly across parts of speech instead of off the top.
 *
 * WordNet returns every noun sense, then every verb sense, then adjectives —
 * an artifact of its file format, not a ranking. Cutting the tail off that
 * order gave "address" its eight noun senses, golf stance and social skill
 * included, and dropped `direct one's efforts towards something` — the sense
 * the writer meant, and the one the old dictionary did not have at all.
 *
 * A word is used as one part of speech in the sentence at hand, and which one
 * is not knowable here, so the honest cut is a fair share of each. Within a
 * part of speech WordNet's own order is kept: that one *is* roughly frequency,
 * and the model reads earlier senses as likelier.
 */
function spreadAcrossParts(synsets: WordPosResult[]): WordPosResult[] {
  const byPart = new Map<string, WordPosResult[]>();
  for (const synset of synsets) {
    const part = PARTS_OF_SPEECH[synset.pos] ?? 'other';
    byPart.set(part, [...(byPart.get(part) ?? []), synset]);
  }

  const groups = [...byPart.values()];
  const taken: WordPosResult[] = [];

  for (let round = 0; taken.length < MAX_SENSES; round++) {
    const before = taken.length;
    for (const group of groups) {
      const next = group[round];
      if (next && taken.length < MAX_SENSES) taken.push(next);
    }
    // Every group is exhausted; there is nothing left to take.
    if (taken.length === before) break;
  }

  return taken;
}

const lookupSynsets = (word: string): Promise<WordPosResult[]> =>
  new Promise((resolve, reject) => {
    try {
      wordpos.lookup(word, resolve);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

/**
 * Returns null when WordNet has no entry — a fact about the word, not a
 * failure. Throws only when the database itself cannot be read, which is a
 * broken install rather than a bad day.
 */
export async function lookupWord(word: string): Promise<RetrievedWord | null> {
  const key = word.toLowerCase();
  const synsets = await lookupSynsets(key);
  if (synsets.length === 0) return null;

  const senses: DictionarySense[] = spreadAcrossParts(synsets).map(
    (synset, index) => ({
      senseId: `s${index}`,
      partOfSpeech: PARTS_OF_SPEECH[synset.pos] ?? 'other',
      definition: synset.def,
      // WordNet ships usage examples with most senses. They are the strongest
      // signal the model has for telling two senses of one word apart.
      ...(synset.exp[0] ? { example: synset.exp[0] } : {}),
    }),
  );

  // Synonyms come from the synsets themselves: every lemma sharing a sense
  // with this word, minus the word. Underscores are WordNet's word separator.
  const synonyms = [
    ...new Set(
      synsets
        .flatMap((synset) => synset.synonyms)
        .map((lemma) => lemma.replace(/_/g, ' '))
        .filter((lemma) => lemma.toLowerCase() !== key),
    ),
  ].slice(0, 12);

  return { word: key, senses, synonyms };
}
