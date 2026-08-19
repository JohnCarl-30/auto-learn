/**
 * Sentence splitting, shared so the client can show a live count as you type.
 *
 * The client's count is a hint only — the API runs this same function and is
 * the authority on the cap. A cap enforced only in the UI is a suggestion.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  return Array.from(segmenter.segment(trimmed), (s) => s.segment.trim()).filter(
    (s) => s.length > 0,
  );
}

/**
 * Locate a substring within a sentence, preferring whole-word matches.
 *
 * The model returns the text it wants replaced, not character offsets — models
 * are unreliable at offsets, and a wrong one silently corrupts the sentence.
 * Returns null when the text isn't found, in which case the caller drops the
 * suggestion rather than guessing.
 */
export function locateSpan(
  sentence: string,
  original: string,
  fromIndex = 0,
): { start: number; end: number } | null {
  if (!original) return null;

  // Anchor with \b only at edges that are word characters. A blanket \b would
  // fail spans like "very big," or "  the", while no anchor at all lets "art"
  // match inside "restart" and corrupt the sentence.
  const leading = /^\w/.test(original) ? '\\b' : '';
  const trailing = /\w$/.test(original) ? '\\b' : '';
  const pattern = new RegExp(`${leading}${escapeRegExp(original)}${trailing}`);

  const match = sentence.slice(fromIndex).match(pattern);
  if (match?.index === undefined) return null;

  const start = fromIndex + match.index;
  return { start, end: start + original.length };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
