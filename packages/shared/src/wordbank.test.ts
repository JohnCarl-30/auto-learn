import { describe, expect, it } from 'vitest';
import { BankExport, BANK_EXPORT_VERSION } from './wordbank';

const entry = {
  id: 'substantial:s0',
  word: 'substantial',
  lemma: 'substantial',
  partOfSpeech: 'adjective',
  senseId: 's0',
  definition: 'Large in amount or importance.',
  synonyms: [{ word: 'considerable', nuance: 'plainer, less formal' }],
  useCases: ['a substantial increase'],
  register: 'formal',
  sourceSentence: 'The results were very big.',
  addedVia: 'accepted',
  addedAt: '2026-08-01T00:00:00.000Z',
  timesReused: 3,
  lastReusedAt: '2026-08-20T00:00:00.000Z',
};

/**
 * An export is only worth having if it can be read back. These pin the shape
 * of the file, which is the half that has to survive: entries already written
 * to someone's disk cannot be migrated after the fact.
 */
describe('BankExport', () => {
  it('accepts a whole bank round-trip', () => {
    const file = {
      version: BANK_EXPORT_VERSION,
      exportedAt: '2026-08-28T00:00:00.000Z',
      entries: [entry],
    };

    const parsed = BankExport.parse(JSON.parse(JSON.stringify(file)));

    expect(parsed.entries).toHaveLength(1);
    // The reuse history is the part a lazy export would drop, and it is the
    // evidence that the word was actually learned.
    expect(parsed.entries[0].timesReused).toBe(3);
    expect(parsed.entries[0].sourceSentence).toBe('The results were very big.');
  });

  it('refuses a file from a version it does not know', () => {
    const result = BankExport.safeParse({
      version: 99,
      exportedAt: '2026-08-28T00:00:00.000Z',
      entries: [],
    });

    expect(result.success).toBe(false);
  });

  it('refuses entries that are not bank entries', () => {
    const result = BankExport.safeParse({
      version: BANK_EXPORT_VERSION,
      exportedAt: '2026-08-28T00:00:00.000Z',
      entries: [{ word: 'substantial' }],
    });

    expect(result.success).toBe(false);
  });

  it('empties cleanly, so a first export is never a special case', () => {
    const result = BankExport.safeParse({
      version: BANK_EXPORT_VERSION,
      exportedAt: '2026-08-28T00:00:00.000Z',
      entries: [],
    });

    expect(result.success).toBe(true);
  });
});
