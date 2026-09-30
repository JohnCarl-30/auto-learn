import { describe, expect, it } from 'vitest';
import type { BankEntry } from './wordbank';
import {
  bankForSync,
  forSync,
  mergeSynced,
  mergeSyncedLists,
  SyncedEntry,
} from './sync';

const entry = (over: Partial<BankEntry> = {}): BankEntry => ({
  id: 'substantial:s1',
  word: 'substantial',
  lemma: 'substantial',
  partOfSpeech: 'adjective',
  senseId: 's1',
  definition: 'Large in amount, size or importance.',
  synonyms: [{ word: 'considerable', nuance: 'slightly more formal' }],
  useCases: ['a substantial improvement'],
  register: 'formal',
  sourceSentence: 'The results showed a big change.',
  addedVia: 'accepted',
  addedAt: '2026-01-01T00:00:00.000Z',
  timesReused: 0,
  lastReusedAt: null,
  ...over,
});

describe('forSync', () => {
  it('drops the sentence and nothing else', () => {
    const local = entry();
    const wire = forSync(local);

    expect(wire).not.toHaveProperty('sourceSentence');
    // Every other field survives, checked against the local record rather than
    // a hand-written list that a new field would not appear in.
    for (const [key, value] of Object.entries(local)) {
      if (key === 'sourceSentence') continue;
      expect(wire[key as keyof SyncedEntry]).toEqual(value);
    }
  });

  it('produces something the wire schema accepts', () => {
    expect(SyncedEntry.safeParse(forSync(entry())).success).toBe(true);
  });
});

describe('mergeSynced', () => {
  /**
   * The failure this function exists to prevent. The incoming record is the
   * earlier acquisition, so it wins the content fields — and it has no sentence.
   * Without the sentence being handed back first, the drill prompt for this word
   * would silently become empty.
   */
  it('never loses a sentence to an earlier record that has none', () => {
    const local = entry({
      addedAt: '2026-06-01T00:00:00.000Z',
      sourceSentence: 'The one they actually wrote.',
    });
    const incoming = forSync(entry({ addedAt: '2026-01-01T00:00:00.000Z' }));

    expect(mergeSynced(local, incoming).sourceSentence).toBe(
      'The one they actually wrote.',
    );
  });

  it('keeps the sentence when the local record is the earlier one too', () => {
    const local = entry({ addedAt: '2026-01-01T00:00:00.000Z' });
    const incoming = forSync(entry({ addedAt: '2026-06-01T00:00:00.000Z' }));

    expect(mergeSynced(local, incoming).sourceSentence).toBe(
      'The results showed a big change.',
    );
  });

  it('gives a word from another device an empty sentence, not undefined', () => {
    const merged = mergeSynced(undefined, forSync(entry()));

    expect(merged.sourceSentence).toBe('');
    expect(merged.word).toBe('substantial');
  });

  it('still keeps the strongest claim from each side', () => {
    const local = entry({ addedVia: 'tapped', timesReused: 1 });
    const incoming = forSync(
      entry({
        addedVia: 'accepted',
        timesReused: 4,
        lastReusedAt: '2026-05-01T00:00:00.000Z',
      }),
    );

    const merged = mergeSynced(local, incoming);
    expect(merged.addedVia).toBe('accepted');
    expect(merged.timesReused).toBe(4);
    expect(merged.lastReusedAt).toBe('2026-05-01T00:00:00.000Z');
  });
});

describe('mergeSyncedLists', () => {
  it('takes the union of both sides', () => {
    const stored = [forSync(entry({ id: 'a:1', lemma: 'a' }))];
    const incoming = [forSync(entry({ id: 'b:1', lemma: 'b' }))];

    expect(mergeSyncedLists(stored, incoming).map((e) => e.id)).toEqual([
      'a:1',
      'b:1',
    ]);
  });

  it('reconciles a word both sides have rather than overwriting it', () => {
    const stored = [forSync(entry({ timesReused: 5, addedVia: 'tapped' }))];
    const incoming = [forSync(entry({ timesReused: 2, addedVia: 'accepted' }))];

    const [merged] = mergeSyncedLists(stored, incoming);
    expect(merged.timesReused).toBe(5);
    expect(merged.addedVia).toBe('accepted');
  });

  it('orders a bank by when its words were met', () => {
    const stored = [
      forSync(entry({ id: 'late:1', addedAt: '2026-09-01T00:00:00.000Z' })),
    ];
    const incoming = [
      forSync(entry({ id: 'early:1', addedAt: '2026-02-01T00:00:00.000Z' })),
    ];

    expect(mergeSyncedLists(stored, incoming).map((e) => e.id)).toEqual([
      'early:1',
      'late:1',
    ]);
  });

  it('never invents a sentence field on the wire', () => {
    const merged = mergeSyncedLists(
      [forSync(entry())],
      [forSync(entry({ timesReused: 3 }))],
    );

    expect(merged[0]).not.toHaveProperty('sourceSentence');
  });
});

describe('bankForSync', () => {
  it('converts a whole bank', () => {
    const { entries, skipped } = bankForSync([
      entry({ id: 'a:1' }),
      entry({ id: 'b:1' }),
    ]);

    expect(entries.map((e) => e.id)).toEqual(['a:1', 'b:1']);
    expect(skipped).toEqual([]);
  });

  /**
   * A record written by an earlier release that a newer schema cannot read. It
   * must not take the rest of the bank down with it: the alternative is a browser
   * whose every future sync is refused over one row.
   */
  it('carries the readable words past one it cannot read, and names it', () => {
    const broken = { ...entry({ id: 'broken:1' }), register: 'academic' };

    const { entries, skipped } = bankForSync([
      broken as unknown as BankEntry,
      entry({ id: 'fine:1' }),
    ]);

    expect(entries.map((e) => e.id)).toEqual(['fine:1']);
    expect(skipped).toEqual(['broken:1']);
  });

  it('still drops the sentence', () => {
    expect(bankForSync([entry()]).entries[0]).not.toHaveProperty(
      'sourceSentence',
    );
  });
});
