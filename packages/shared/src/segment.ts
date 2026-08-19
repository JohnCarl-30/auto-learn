import type { GatedSuggestion, SilentFix } from './propose';

/**
 * One renderable piece of a sentence. `start`/`end` are offsets into the
 * sentence text, so a view can key on them and slice the source if needed.
 */
export type Segment =
  | { kind: 'text'; start: number; end: number; value: string }
  | { kind: 'silent'; start: number; end: number; fix: SilentFix }
  | { kind: 'gated'; start: number; end: number; suggestion: GatedSuggestion };

/**
 * Decomposes a sentence into an ordered, non-overlapping run of segments.
 *
 * Both span lists carry offsets into the same string (the post-silent-fix
 * `text`), so they interleave. Anything not covered by a span is plain text,
 * which the view splits into individually tappable words.
 *
 * Guarantees, all covered by tests:
 *   - segments are ordered and contiguous
 *   - the segments exactly tile the input: no gaps, no overlaps, nothing lost
 *   - overlapping input spans are resolved deterministically (earliest start
 *     wins; ties break toward the longer span) rather than throwing or
 *     producing garbled output
 */
export function segmentSentence(
  text: string,
  silentFixes: readonly SilentFix[],
  gated: readonly GatedSuggestion[],
): Segment[] {
  type Mark = { start: number; end: number; build: () => Segment };

  const marks: Mark[] = [
    ...silentFixes.map((fix) => ({
      start: fix.start,
      end: fix.end,
      build: (): Segment => ({
        kind: 'silent',
        start: fix.start,
        end: fix.end,
        fix,
      }),
    })),
    ...gated.map((suggestion) => ({
      start: suggestion.start,
      end: suggestion.end,
      build: (): Segment => ({
        kind: 'gated',
        start: suggestion.start,
        end: suggestion.end,
        suggestion,
      }),
    })),
  ];

  const ordered = marks
    .filter(
      (m) =>
        m.start >= 0 && m.end <= text.length && m.end > m.start,
    )
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const mark of ordered) {
    // A span starting before the cursor overlaps one already emitted. Dropping
    // it keeps the tiling invariant; the alternative is silently corrupting
    // the sentence the user is reading.
    if (mark.start < cursor) continue;

    if (mark.start > cursor) {
      segments.push({
        kind: 'text',
        start: cursor,
        end: mark.start,
        value: text.slice(cursor, mark.start),
      });
    }

    segments.push(mark.build());
    cursor = mark.end;
  }

  if (cursor < text.length) {
    segments.push({
      kind: 'text',
      start: cursor,
      end: text.length,
      value: text.slice(cursor),
    });
  }

  return segments;
}

/**
 * Splits a plain-text segment into words and the whitespace between them, so
 * every word can be made individually tappable. Whitespace is preserved as its
 * own token — dropping it would reflow the sentence.
 */
export function tokenizeWords(
  value: string,
  offset: number,
): Array<{ value: string; start: number; end: number; isWord: boolean }> {
  const tokens: Array<{
    value: string;
    start: number;
    end: number;
    isWord: boolean;
  }> = [];

  const pattern = /(\s+)|([^\s]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    tokens.push({
      value: match[0],
      start: offset + match.index,
      end: offset + match.index + match[0].length,
      isWord: match[2] !== undefined,
    });
  }

  return tokens;
}

/** Strips edge punctuation so "results," looks up as "results". */
export function bareWord(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}
