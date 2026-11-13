import { focus, measure, update, type Reading } from './habits';
import type { SpokenResult } from './use-lesson';

const attempt = (over: Partial<SpokenResult> = {}): SpokenResult => ({
  // Twenty different words.
  answer: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty',
  seconds: 8,
  fillers: { total: 0, byWord: {} },
  feedback: {
    firstSentence: '',
    pointFirst: true,
    pointFirstNote: '',
    parts: [
      { label: 'point', quote: 'x' },
      { label: 'reason', quote: null },
    ],
    structureNote: '',
    wordUse: null,
    reviewedText: null,
    review: null,
    fillerNotes: [],
  },
  ...over,
});

describe('measure', () => {
  it('works out pace, fillers, variety and structure from one spoken answer', () => {
    const reading = measure(attempt({ fillers: { total: 1, byWord: { um: 1 } } }))!;
    // 20 words in 8 seconds is 150 a minute, inside the clear band.
    expect(reading.pace).toEqual({ value: 150, score: 1 });
    // 1 filler in 20 words is 5 in a hundred.
    expect(reading.fillers.value).toBe(5);
    expect(reading.fillers.score).toBeCloseTo(0.375);
    expect(reading.range).toEqual({ value: 1, score: 1 });
    // Point first, and one of two parts heard.
    expect(reading.structure.score).toBe(0.75);
  });

  it('marks speech down the further it is from the clear band, fast or slow', () => {
    expect(measure(attempt({ seconds: 12 }))!.pace.score).toBeCloseTo(0.5); // 100 wpm
    expect(measure(attempt({ seconds: 6 }))!.pace.score).toBeCloseTo(1 - 40 / 60); // 200 wpm
  });

  it('does not let a long answer look less varied than a short one', () => {
    const words = Array.from({ length: 100 }, (_, index) => `w${'abcdefghij'[index % 10]}${'klmnopqrst'[Math.floor(index / 10)]}`);
    expect(measure(attempt({ answer: words.join(' '), seconds: 40 }))!.range.value).toBe(1);
  });

  it('measures nothing for a typed answer or a few words', () => {
    expect(measure(attempt({ seconds: null }))).toBeNull();
    expect(measure(attempt({ answer: 'Too short to say.' }))).toBeNull();
  });
});

const reading = (score: number): Reading => ({
  pace: { value: 150, score },
  fillers: { value: 2, score },
  range: { value: 0.8, score },
  structure: { value: score, score },
});

describe('update', () => {
  it('starts from the first answer, then moves a little with each one', () => {
    const first = update(null, reading(1));
    expect(first.answers).toBe(1);
    expect(first.skills.pace).toEqual({ value: 150, score: 1, before: null });

    const second = update(first, reading(0));
    expect(second.answers).toBe(2);
    expect(second.skills.pace.score).toBeCloseTo(0.7);
    expect(second.skills.pace.before).toBe(1);
  });
});

describe('focus', () => {
  it('picks the lowest running score', () => {
    const habits = update(null, { ...reading(0.9), fillers: { value: 7, score: 0.1 } });
    expect(focus(habits)).toBe('fillers');
  });
});
