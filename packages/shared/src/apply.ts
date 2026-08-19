import type { GatedSuggestion, ReviewedSentence, SilentFix } from './propose';

/**
 * Accepts one gated suggestion, splicing the replacement into the sentence.
 *
 * Every remaining span sits at an offset into `text`, so replacing a span of a
 * different length invalidates all of them downstream. Getting this wrong
 * silently mis-highlights the rest of the sentence, which is why it lives here
 * with tests rather than inline in a component.
 *
 * Returns the sentence unchanged if the suggestion is not found.
 */
export function applyReplacement(
  sentence: ReviewedSentence,
  suggestionId: string,
  replacement: string,
): ReviewedSentence {
  const accepted = sentence.gated.find((g) => g.id === suggestionId);
  if (!accepted) return sentence;

  const text =
    sentence.text.slice(0, accepted.start) +
    replacement +
    sentence.text.slice(accepted.end);

  const delta = replacement.length - (accepted.end - accepted.start);

  return {
    ...sentence,
    text,
    silentFixes: shiftAll(sentence.silentFixes, accepted, delta),
    gated: shiftAll(
      sentence.gated.filter((g) => g.id !== suggestionId),
      accepted,
      delta,
    ),
  };
}

/** Rejects a suggestion: the user's wording stands, the marker goes away. */
export function dismissSuggestion(
  sentence: ReviewedSentence,
  suggestionId: string,
): ReviewedSentence {
  return {
    ...sentence,
    gated: sentence.gated.filter((g) => g.id !== suggestionId),
  };
}

type Span = SilentFix | GatedSuggestion;

function shiftAll<T extends Span>(
  spans: readonly T[],
  replaced: { start: number; end: number },
  delta: number,
): T[] {
  const result: T[] = [];

  for (const span of spans) {
    // Entirely before the edit — untouched.
    if (span.end <= replaced.start) {
      result.push(span);
      continue;
    }

    // Entirely after — slides by the length difference.
    if (span.start >= replaced.end) {
      result.push({ ...span, start: span.start + delta, end: span.end + delta });
      continue;
    }

    // Overlapping the replaced region: the text it pointed at is gone, so
    // there is no honest offset to give it. Drop it rather than leave a marker
    // pointing at the wrong words.
  }

  return result;
}
