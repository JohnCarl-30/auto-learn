import type { BankEntry } from '@auto-learn/shared';
import { pickBankWord } from './session-word';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const HOURS = 60 * 60 * 1000;
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOURS).toISOString();

const entry = (
  lemma: string,
  addedAt: string,
  lastReusedAt: string | null = null,
): BankEntry => ({
  id: `${lemma}:1`,
  word: lemma,
  lemma,
  partOfSpeech: 'adjective',
  senseId: '1',
  definition: `the meaning of ${lemma}`,
  synonyms: [],
  useCases: [],
  register: 'neutral',
  sourceSentence: `A sentence with ${lemma}.`,
  addedVia: 'accepted',
  addedAt,
  timesReused: lastReusedAt ? 1 : 0,
  lastReusedAt,
});

describe('pickBankWord', () => {
  it('prefers a word never reused, oldest first', () => {
    const picked = pickBankWord(
      [
        entry('reused', ago(200), ago(48)),
        entry('newer', ago(10)),
        entry('older', ago(100)),
      ],
      NOW,
    );
    expect(picked?.lemma).toBe('older');
  });

  it('skips words reused in the last day', () => {
    const picked = pickBankWord(
      [
        entry('today', ago(300), ago(2)),
        entry('last-week', ago(200), ago(24 * 7)),
        entry('yesterday', ago(400), ago(30)),
      ],
      NOW,
    );
    expect(picked?.lemma).toBe('last-week');
  });

  it('returns null when every word was reused today', () => {
    expect(
      pickBankWord([entry('a', ago(50), ago(1)), entry('b', ago(60), ago(23))], NOW),
    ).toBeNull();
  });
});
