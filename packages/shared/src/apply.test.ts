import { describe, expect, it } from 'vitest';
import { applyReplacement, dismissSuggestion } from './apply';
import type { ReviewedSentence } from './propose';

const gate = (
  id: string,
  start: number,
  end: number,
  original: string,
): ReviewedSentence['gated'][number] => ({
  id,
  type: 'word-choice',
  original,
  start,
  end,
  teaser: 'stronger word available',
});

//                     0         1         2
//                     0123456789012345678901234567
const TEXT = 'The results were very big.';

const sentence = (
  overrides: Partial<ReviewedSentence> = {},
): ReviewedSentence => ({
  index: 0,
  original: TEXT,
  text: TEXT,
  silentFixes: [],
  gated: [gate('g1', 17, 25, 'very big')],
  ...overrides,
});

describe('applyReplacement', () => {
  it('splices the replacement into the text', () => {
    const result = applyReplacement(sentence(), 'g1', 'substantial');
    expect(result.text).toBe('The results were substantial.');
  });

  it('removes the accepted suggestion', () => {
    const result = applyReplacement(sentence(), 'g1', 'substantial');
    expect(result.gated).toHaveLength(0);
  });

  it('leaves the original untouched, so the diff is still available', () => {
    const result = applyReplacement(sentence(), 'g1', 'substantial');
    expect(result.original).toBe(TEXT);
  });

  it('is a no-op for an unknown suggestion id', () => {
    const before = sentence();
    expect(applyReplacement(before, 'nope', 'x')).toBe(before);
  });

  it('shifts a later span forward when the replacement is longer', () => {
    const before = sentence({
      gated: [gate('g1', 4, 11, 'results'), gate('g2', 17, 25, 'very big')],
    });
    // "results" (7) -> "findings" (8): everything after moves by +1
    const result = applyReplacement(before, 'g1', 'findings');

    expect(result.text).toBe('The findings were very big.');
    const later = result.gated.find((g) => g.id === 'g2')!;
    expect(result.text.slice(later.start, later.end)).toBe('very big');
  });

  it('shifts a later span backward when the replacement is shorter', () => {
    const before = sentence({
      gated: [gate('g1', 4, 11, 'results'), gate('g2', 17, 25, 'very big')],
    });
    // "results" (7) -> "data" (4): everything after moves by -3
    const result = applyReplacement(before, 'g1', 'data');

    expect(result.text).toBe('The data were very big.');
    const later = result.gated.find((g) => g.id === 'g2')!;
    expect(result.text.slice(later.start, later.end)).toBe('very big');
  });

  it('leaves an earlier span alone', () => {
    const before = sentence({
      gated: [gate('g1', 4, 11, 'results'), gate('g2', 17, 25, 'very big')],
    });
    const result = applyReplacement(before, 'g2', 'substantial');

    const earlier = result.gated.find((g) => g.id === 'g1')!;
    expect(earlier.start).toBe(4);
    expect(result.text.slice(earlier.start, earlier.end)).toBe('results');
  });

  it('keeps silent fixes pointing at the right text', () => {
    const before = sentence({
      silentFixes: [
        {
          id: 's1',
          type: 'typo',
          original: 'reuslts',
          replacement: 'results',
          start: 4,
          end: 11,
          note: 'spelling',
        },
      ],
    });
    const result = applyReplacement(before, 'g1', 'substantial');

    const fix = result.silentFixes[0];
    expect(result.text.slice(fix.start, fix.end)).toBe('results');
  });

  it('drops a span that overlapped the replaced text rather than mispointing it', () => {
    const before = sentence({
      gated: [gate('g1', 17, 25, 'very big'), gate('g2', 22, 25, 'big')],
    });
    const result = applyReplacement(before, 'g1', 'substantial');

    expect(result.gated.find((g) => g.id === 'g2')).toBeUndefined();
  });
});

describe('dismissSuggestion', () => {
  it('removes the marker without touching the text', () => {
    const result = dismissSuggestion(sentence(), 'g1');
    expect(result.text).toBe(TEXT);
    expect(result.gated).toHaveLength(0);
  });
});
