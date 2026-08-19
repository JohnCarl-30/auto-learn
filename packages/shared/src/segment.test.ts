import { describe, expect, it } from 'vitest';
import { bareWord, segmentSentence, tokenizeWords } from './segment';
import type { GatedSuggestion, SilentFix } from './propose';

const silent = (start: number, end: number, replacement: string): SilentFix => ({
  id: `s${start}`,
  type: 'typo',
  original: 'x',
  replacement,
  start,
  end,
  note: 'spelling',
});

const gate = (start: number, end: number, original: string): GatedSuggestion => ({
  id: `g${start}`,
  type: 'word-choice',
  original,
  start,
  end,
  teaser: 'stronger word available',
});

/** The invariant that matters: segments must exactly tile the sentence. */
const tiles = (text: string, segments: ReturnType<typeof segmentSentence>) => {
  let cursor = 0;
  for (const s of segments) {
    expect(s.start).toBe(cursor);
    cursor = s.end;
  }
  expect(cursor).toBe(text.length);
};

describe('segmentSentence', () => {
  it('returns one text segment when there are no spans', () => {
    const text = 'The results were substantial.';
    const segments = segmentSentence(text, [], []);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ kind: 'text', value: text });
    tiles(text, segments);
  });

  it('returns nothing for an empty sentence', () => {
    expect(segmentSentence('', [], [])).toEqual([]);
  });

  it('interleaves text, silent fixes and gates in order', () => {
    const text = 'The results were very big.';
    const segments = segmentSentence(
      text,
      [silent(4, 11, 'results')],
      [gate(17, 25, 'very big')],
    );

    expect(segments.map((s) => s.kind)).toEqual([
      'text',
      'silent',
      'text',
      'gated',
      'text',
    ]);
    tiles(text, segments);
  });

  it('handles a span at index 0 and a span at the very end', () => {
    const text = 'Big results matter';
    const segments = segmentSentence(text, [], [gate(0, 3, 'Big'), gate(12, 18, 'matter')]);

    expect(segments[0].kind).toBe('gated');
    expect(segments[segments.length - 1].kind).toBe('gated');
    tiles(text, segments);
  });

  it('handles adjacent spans with no gap between them', () => {
    const text = 'abcdef';
    const segments = segmentSentence(text, [], [gate(0, 3, 'abc'), gate(3, 6, 'def')]);

    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.kind === 'gated')).toBe(true);
    tiles(text, segments);
  });

  it('drops an overlapping span rather than garbling the sentence', () => {
    const text = 'The results were very big.';
    const segments = segmentSentence(
      text,
      [],
      [gate(17, 25, 'very big'), gate(22, 25, 'big')],
    );

    expect(segments.filter((s) => s.kind === 'gated')).toHaveLength(1);
    tiles(text, segments);
  });

  it('ignores spans that fall outside the text', () => {
    const text = 'Short.';
    const segments = segmentSentence(text, [], [gate(50, 60, 'nope')]);
    expect(segments.map((s) => s.kind)).toEqual(['text']);
    tiles(text, segments);
  });

  it('ignores zero-width and inverted spans', () => {
    const text = 'Short.';
    const segments = segmentSentence(text, [], [gate(2, 2, ''), gate(4, 1, 'bad')]);
    expect(segments.map((s) => s.kind)).toEqual(['text']);
    tiles(text, segments);
  });
});

describe('tokenizeWords', () => {
  it('preserves whitespace as its own token so the sentence does not reflow', () => {
    const tokens = tokenizeWords('the big idea', 0);
    expect(tokens.map((t) => t.value)).toEqual(['the', ' ', 'big', ' ', 'idea']);
    expect(tokens.filter((t) => t.isWord)).toHaveLength(3);
  });

  it('offsets tokens into the parent sentence', () => {
    const tokens = tokenizeWords('idea', 10);
    expect(tokens[0]).toMatchObject({ start: 10, end: 14 });
  });
});

describe('bareWord', () => {
  it('strips edge punctuation', () => {
    expect(bareWord('results,')).toBe('results');
    expect(bareWord('"quoted."')).toBe('quoted');
  });

  it('keeps word-internal punctuation', () => {
    expect(bareWord("isn't")).toBe("isn't");
    expect(bareWord('well-known')).toBe('well-known');
  });
});
