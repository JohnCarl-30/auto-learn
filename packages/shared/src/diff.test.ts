import { describe, expect, it } from 'vitest';
import { diffWords, originalOf, revisedOf, wordToTeach } from './diff';

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

describe('wordToTeach', () => {
  it('takes the one word a phrase gate introduces', () => {
    // The case that made this necessary: the card behind this gate was looked
    // up as "significant effect", which no dictionary carries.
    expect(wordToTeach('big effect', 'significant effect')).toBe('significant');
  });

  it('is a no-op when the gate is already a single word', () => {
    expect(wordToTeach('big', 'substantial')).toBe('substantial');
  });

  it('ignores the words that merely went away', () => {
    expect(wordToTeach('lots of people', 'many people')).toBe('many');
  });

  it('falls back to the replacement when the change removes rather than adds', () => {
    expect(wordToTeach('because of the fact that', 'because')).toBe('because');
  });

  it('does not mistake punctuation for the lesson', () => {
    expect(wordToTeach('big, effect', 'substantial effect')).toBe('substantial');
  });

  /**
   * Two new words is a phrase, and there is no single card to write for it.
   * Returning the phrase means the lookup fails and says so, which is better
   * than teaching one half of a change the reader is being offered whole.
   */
  it('keeps the phrase when the change is genuinely more than one word', () => {
    expect(wordToTeach('big effect', 'far greater effect')).toBe(
      'far greater effect',
    );
  });
});

/**
 * These were all live defects, found by opening a gate in a browser and then
 * running the real WordNet against what the gate would have taught.
 */
describe('wordToTeach, when there is nothing to teach', () => {
  it.each([
    ['our experiment', 'the experiment', 'the'],
    ['our experiment', 'this experiment', 'this'],
    ['in order to', 'to', 'to'],
    ['the students is', 'the students are', 'are'],
  ])('refuses %p → %p, whose lesson is only %p', (original, replacement) => {
    expect(wordToTeach(original, replacement)).toBeNull();
  });

  /**
   * The dangerous one. "can" is in WordNet — as a tin, and as the verb for
   * putting food in one — so this gate did not fail. It opened a grounded,
   * confident card teaching a learner the wrong word entirely.
   */
  it('refuses a modal that a dictionary does happen to list', () => {
    expect(wordToTeach('is able to run', 'can run')).toBeNull();
    expect(wordToTeach('has the ability to', 'can')).toBeNull();
  });

  it('is not fooled by a capital at the start of a sentence', () => {
    expect(wordToTeach('Our experiment', 'The experiment')).toBeNull();
  });

  it('still teaches a real word that happens to sit beside a function word', () => {
    expect(wordToTeach('big effect', 'significant effect')).toBe('significant');
    expect(wordToTeach('very big', 'substantial')).toBe('substantial');
    expect(wordToTeach('a lot of', 'much')).toBe('much');
    // Quantifiers and subordinators stay teachable; they are real lessons.
    expect(wordToTeach('lots of people', 'many people')).toBe('many');
  });
});
