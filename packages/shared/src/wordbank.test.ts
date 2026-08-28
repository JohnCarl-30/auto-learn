import { describe, expect, it } from 'vitest';
import { BankEntry, BankExport, BANK_EXPORT_VERSION, mergeBankEntry } from './wordbank';

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

/**
 * The same word met on two devices. Restoring must never cost someone evidence
 * they earned — a merge that overwrites is indistinguishable from data loss,
 * and it happens silently.
 */
describe('mergeBankEntry', () => {
  const at = (iso: string, over: Partial<BankEntry> = {}): BankEntry =>
    BankEntry.parse({ ...entry, addedAt: iso, ...over });

  it('keeps the higher reuse count, whichever side holds it', () => {
    const local = at('2026-08-01T00:00:00.000Z', { timesReused: 1 });
    const file = at('2026-08-05T00:00:00.000Z', { timesReused: 6 });

    expect(mergeBankEntry(local, file).timesReused).toBe(6);
    expect(mergeBankEntry(file, local).timesReused).toBe(6);
  });

  it('keeps the most recent reuse date, ignoring nulls', () => {
    const local = at('2026-08-01T00:00:00.000Z', { lastReusedAt: null });
    const file = at('2026-08-05T00:00:00.000Z', {
      lastReusedAt: '2026-08-20T00:00:00.000Z',
    });

    expect(mergeBankEntry(local, file).lastReusedAt).toBe(
      '2026-08-20T00:00:00.000Z',
    );
  });

  it('never downgrades an accepted word to a tapped one', () => {
    const accepted = at('2026-08-01T00:00:00.000Z', { addedVia: 'accepted' });
    const tapped = at('2026-08-05T00:00:00.000Z', { addedVia: 'tapped' });

    // Whichever way round, and whichever came first: adopting the word is the
    // stronger act, and a later curious tap does not undo it.
    expect(mergeBankEntry(accepted, tapped).addedVia).toBe('accepted');
    expect(mergeBankEntry(tapped, accepted).addedVia).toBe('accepted');
  });

  it('takes the first acquisition, and the sentence it came from', () => {
    const older = at('2026-07-01T00:00:00.000Z', {
      sourceSentence: 'The sentence I actually met it in.',
    });
    const newer = at('2026-08-05T00:00:00.000Z', {
      sourceSentence: 'A later one.',
    });

    const merged = mergeBankEntry(newer, older);

    expect(merged.addedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(merged.sourceSentence).toBe('The sentence I actually met it in.');
  });

  it('is order-independent for everything it decides', () => {
    const a = at('2026-08-01T00:00:00.000Z', {
      timesReused: 2,
      addedVia: 'tapped',
      lastReusedAt: '2026-08-10T00:00:00.000Z',
    });
    const b = at('2026-08-05T00:00:00.000Z', {
      timesReused: 5,
      addedVia: 'accepted',
      lastReusedAt: null,
    });

    expect(mergeBankEntry(a, b)).toEqual(mergeBankEntry(b, a));
  });
});
