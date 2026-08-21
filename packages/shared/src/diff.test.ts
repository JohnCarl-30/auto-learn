import { describe, expect, it } from 'vitest';
import { diffWords, originalOf, revisedOf } from './diff';

const text = (parts: ReturnType<typeof diffWords>) =>
  parts.map((part) => `${part.kind}:${part.value}`);

describe('diffWords', () => {
  it('says nothing changed when nothing changed', () => {
    expect(diffWords('The results were substantial.', 'The results were substantial.')).toEqual([
      { kind: 'same', value: 'The results were substantial.' },
    ]);
  });

  it('marks a replaced word, and leaves the rest alone', () => {
    const parts = diffWords(
      'The results were very big.',
      'The results were substantial.',
    );

    expect(text(parts)).toEqual([
      'same:The results were ',
      'removed:very big.',
      'added:substantial.',
    ]);
  });

  it('marks an insertion without touching what surrounds it', () => {
    const parts = diffWords('They warrant study.', 'They warrant further study.');

    expect(revisedOf(parts)).toBe('They warrant further study.');
    expect(parts.filter((part) => part.kind === 'removed')).toEqual([]);
    expect(parts.some((part) => part.kind === 'added' && part.value.includes('further'))).toBe(
      true,
    );
  });

  it('marks a deletion', () => {
    const parts = diffWords('It was really very good.', 'It was good.');

    expect(parts.filter((part) => part.kind === 'added')).toEqual([]);
    expect(originalOf(parts)).toBe('It was really very good.');
    expect(revisedOf(parts)).toBe('It was good.');
  });

  it('treats an empty original as all new', () => {
    expect(diffWords('', 'A sentence.')).toEqual([
      { kind: 'added', value: 'A sentence.' },
    ]);
  });

  it('handles both sides empty', () => {
    expect(diffWords('', '')).toEqual([]);
  });

  /**
   * The two invariants the renderer depends on. A view shows the original by
   * reading same+removed and the revision by reading same+added, so a diff
   * that loses or invents a character shows the writer text they never wrote.
   */
  it.each([
    ['The results was good.', 'The results were good.'],
    ['i think its fine', 'I think it is fine.'],
    ['One. Two. Three.', 'Three. Two. One.'],
    ['aaa bbb ccc', 'ccc bbb aaa'],
    ['Spacing   is   odd.', 'Spacing is odd.'],
    ['Nothing here', ''],
    ['', 'Everything here'],
  ])('reconstructs both sides of %j → %j', (before, after) => {
    const parts = diffWords(before, after);

    expect(originalOf(parts)).toBe(before);
    expect(revisedOf(parts)).toBe(after);
  });

  it('merges adjacent runs, so one change is one mark', () => {
    const parts = diffWords('a b c d', 'a x y d');
    const kinds = parts.map((part) => part.kind);

    // No two neighbours share a kind, and nothing is an empty run.
    expect(kinds.every((kind, i) => i === 0 || kind !== kinds[i - 1])).toBe(true);
    expect(parts.every((part) => part.value.length > 0)).toBe(true);
  });

  /**
   * Past the guard the diff goes coarse rather than building a table with
   * millions of cells. It still has to reconstruct both sides.
   */
  it('degrades to whole-text replacement on input far past anything the UI sends', () => {
    const before = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
    const after = `${before} tail`;

    const parts = diffWords(before, after);

    expect(text(parts)).toEqual([`removed:${before}`, `added:${after}`]);
    expect(originalOf(parts)).toBe(before);
    expect(revisedOf(parts)).toBe(after);
  });
});
