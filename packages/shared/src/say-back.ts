/**
 * Judging a word said out loud, against what the transcriber heard.
 *
 * The product already speaks words and already listens to sentences; this is
 * the two halves pointed at each other. A learner hears the card's word, says
 * it back, and finds out whether it came through.
 *
 * The tone of the whole feature is set by one fact: transcription of accented
 * English is good rather than perfect, which is the same reason `/dictate`
 * hands back a transcript instead of proposing on it. A verdict here is
 * therefore never "you said it wrong" — it is what was heard, and the caller
 * shows that. Blaming a learner for the transcriber's miss is the one outcome
 * this must not produce, and it is the likeliest one.
 */

export type SaidBack =
  | { verdict: 'matched'; heard: string }
  /** Heard as a near neighbour — one or two letters out. */
  | { verdict: 'close'; heard: string }
  | { verdict: 'different'; heard: string }
  /** Silence, or nothing the transcriber would commit to. */
  | { verdict: 'nothing' };

const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Levenshtein, iterative and small.
 *
 * Only ever runs over single words, so the quadratic table is a few dozen
 * cells. Used for one decision — is this a near miss or a different word —
 * because "substantial" heard as "substancial" should encourage rather than
 * correct.
 */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length];
}

/**
 * How forgiving "close" is, by word length.
 *
 * A one-letter slip in "vast" is most of the word; the same slip in
 * "corroborate" is a lisp. Scaling with length keeps short words from matching
 * everything and long words from being failed for a syllable.
 */
const tolerance = (word: string) => Math.max(1, Math.floor(word.length / 5));

/**
 * Compares a spoken attempt against the word the card was teaching.
 *
 * The transcript may be a whole phrase — people say "substantial" and the
 * transcriber writes "it's substantial" — so every word in it is a candidate
 * and the best one wins. Anything else would fail a learner for being polite.
 */
export function judgeSaidBack(word: string, transcript: string): SaidBack {
  const heard = transcript.trim();
  const target = normalise(word);
  const spoken = normalise(heard).split(' ').filter(Boolean);

  if (!target || spoken.length === 0) return { verdict: 'nothing' };
  if (spoken.includes(target)) return { verdict: 'matched', heard };

  const nearest = Math.min(...spoken.map((token) => distance(target, token)));
  return nearest <= tolerance(target)
    ? { verdict: 'close', heard }
    : { verdict: 'different', heard };
}
