import type { BankEntry, LessonProgress } from '@auto-learn/shared';
import { chooseUnit, reviewItems } from './lesson-plan';

// Only the fields these helpers read.
const entry = (id: string, lemma: string, sourceSentence: string) =>
  ({ id, lemma, sourceSentence, definition: `the meaning of ${lemma}` }) as BankEntry;

const progress = (over: Partial<LessonProgress>): LessonProgress => ({
  xp: 0,
  streak: 0,
  doneToday: 0,
  counts: {},
  highestUnlocked: 1,
  pathFinished: false,
  recentPromptIds: [],
  dueEntryIds: [],
  ...over,
});

describe('reviewItems', () => {
  const bank = [
    entry('argue:1', 'argue', 'They argued all night.'),
    entry('brief:1', 'brief', 'A sentence without the word.'),
  ];

  it('keeps the server’s order and drops ids with no local entry', () => {
    const items = reviewItems(bank, ['brief:1', 'gone:1', 'argue:1']);
    expect(items.map((item) => item.entryId)).toEqual(['brief:1', 'argue:1']);
  });

  it('blanks an inflected form in the learner’s own sentence', () => {
    expect(reviewItems(bank, ['argue:1'])[0]).toMatchObject({
      cue: 'They _____ all night.',
      cueIsDefinition: false,
    });
  });

  // Showing the sentence unmasked would be a cue with no blank to fill.
  it('falls back to the definition when the mask changes nothing', () => {
    expect(reviewItems(bank, ['brief:1'])[0]).toMatchObject({
      cue: 'the meaning of brief',
      cueIsDefinition: true,
    });
  });
});

describe('chooseUnit', () => {
  it('honours a chosen unit only when it is unlocked', () => {
    expect(chooseUnit(progress({ highestUnlocked: 3 }), 2).id).toBe(2);
    expect(chooseUnit(progress({ highestUnlocked: 3 }), 5).id).toBe(3);
  });

  it('keeps a chosen unit even after the path is finished', () => {
    expect(chooseUnit(progress({ highestUnlocked: 7, pathFinished: true }), 1).id).toBe(1);
  });
});
