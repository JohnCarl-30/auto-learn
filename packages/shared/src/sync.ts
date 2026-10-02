import { z } from 'zod';
import { BankEntry, mergeBankEntry } from './wordbank';

/**
 * A banked word, as it crosses the network.
 *
 * Identical to `BankEntry` but for one omission: `sourceSentence`, the writer's
 * own draft text the word was met in, never leaves the browser. Everything
 * needed to rebuild a card and to schedule review — the sense, the definition,
 * the synonyms, the reuse history — travels; the sentence does not.
 *
 * Stated as an omission of the local type rather than as its own object, so a
 * field added to a banked word is a field that syncs, and forgetting to carry it
 * is not possible. The one deliberate exclusion is the one written here.
 */
export const SyncedEntry = BankEntry.omit({ sourceSentence: true });
export type SyncedEntry = z.infer<typeof SyncedEntry>;

/**
 * Sixteen hundred words, which is far past any real bank and still a bounded
 * request body. Guarded because this is an authenticated write whose size the
 * client chooses.
 */
export const MAX_SYNC_ENTRIES = 1_600;

export const BankSyncRequest = z.object({
  entries: z.array(SyncedEntry).max(MAX_SYNC_ENTRIES),
});
export type BankSyncRequest = z.infer<typeof BankSyncRequest>;

export const BankSyncResponse = z.object({
  /** The reconciled bank: everything this account knows, after the merge. */
  entries: z.array(SyncedEntry),
  syncedAt: z.string(),
});
export type BankSyncResponse = z.infer<typeof BankSyncResponse>;

/**
 * Drops the sentence. The only place a local entry becomes a wire entry.
 *
 * Done by parsing rather than by destructuring, so the schema above is the sole
 * authority on what crosses the network: Zod strips what it does not declare, so
 * a field can only travel by being added to `BankEntry` — and the one exclusion
 * is declared in one place instead of being restated here.
 */
export function forSync(entry: BankEntry): SyncedEntry {
  return SyncedEntry.parse(entry);
}

/**
 * A whole bank, with anything unreadable set aside rather than thrown.
 *
 * The strict version above is right for one record; for a bank it is not. These
 * records were written into IndexedDB by earlier releases and are read back
 * indefinitely, so one row a newer schema cannot parse would otherwise refuse
 * every sync that browser ever attempts — including the words it *can* send.
 * Dropping the unreadable one and carrying the rest is the same trade the server
 * makes reading its own table back: one word is worth losing, a bank is not.
 *
 * The skipped ids are returned rather than logged because this package has no
 * business knowing where logs go — nothing here imports a runtime, which is what
 * lets the same functions run in a browser, in Node and in a test.
 */
export function bankForSync(entries: BankEntry[]): {
  entries: SyncedEntry[];
  skipped: string[];
} {
  const wire: SyncedEntry[] = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    const parsed = SyncedEntry.safeParse(entry);
    if (parsed.success) wire.push(parsed.data);
    else skipped.push(entry?.id ?? '(no id)');
  }

  return { entries: wire, skipped };
}

/**
 * Reconciles a synced word with whatever this browser already had.
 *
 * Deliberately implemented by handing the sentence back before merging, rather
 * than by writing a second merge. `mergeBankEntry` resolves these conflicts
 * already and is tested directly — but it takes the *content* fields from
 * whichever record was acquired first, and `sourceSentence` is one of them. A
 * synced record has no sentence, so if it happened to be the earlier one it
 * would win that field with nothing and erase the memory hook the drill is built
 * on.
 *
 * Giving the incoming record the sentence we already hold makes the two sides
 * agree on that field before the merge runs, so no ordering can lose it. A word
 * arriving from another device keeps an empty sentence until it is met here.
 */
export function mergeSynced(
  local: BankEntry | undefined,
  incoming: SyncedEntry,
): BankEntry {
  const withSentence: BankEntry = {
    ...incoming,
    sourceSentence: local?.sourceSentence ?? '',
  };

  return local ? mergeBankEntry(local, withSentence) : withSentence;
}

/**
 * Merges two lists of synced words by id.
 *
 * Used on the server, where neither side has a sentence and both are wire
 * records — so `mergeBankEntry` is fed empty sentences on both sides and the
 * field it would pick is the same either way.
 */
export function mergeSyncedLists(
  stored: SyncedEntry[],
  incoming: SyncedEntry[],
): SyncedEntry[] {
  const byId = new Map(stored.map((entry) => [entry.id, entry]));

  for (const entry of incoming) {
    const existing = byId.get(entry.id);
    byId.set(
      entry.id,
      existing
        ? forSync(
            mergeBankEntry(
              { ...existing, sourceSentence: '' },
              { ...entry, sourceSentence: '' },
            ),
          )
        : entry,
    );
  }

  // Oldest acquisition first, so a bank reads as the history it is.
  return [...byId.values()].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}
