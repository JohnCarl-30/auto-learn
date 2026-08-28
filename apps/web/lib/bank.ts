'use client';

import { openDB, type IDBPDatabase } from 'idb';
import {
  BANK_EXPORT_VERSION,
  findReused,
  type BankEntry,
  type BankExport,
  type WordCard,
} from '@auto-learn/shared';

const DB_NAME = 'auto-learn';
const DB_VERSION = 1;
const STORE = 'words';

/**
 * The bank is the product's memory. It lives in IndexedDB rather than
 * localStorage because these are structured records that grow and will later
 * sync to a server — and the schema deliberately mirrors that future table so
 * the claim-your-bank migration is a copy, not a rewrite.
 */
async function connect(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (db.objectStoreNames.contains(STORE)) return;
      const store = db.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('lemma', 'lemma');
      store.createIndex('addedAt', 'addedAt');
    },
  });
}

/**
 * Keyed by lemma and sense, so banking the same word twice updates rather than
 * duplicates — and so the same word in two different senses is two entries,
 * which is correct: they are two things to learn.
 */
function entryId(lemma: string, senseId: string): string {
  return `${lemma.toLowerCase()}:${senseId}`;
}

export async function bankWord(
  card: WordCard,
  sourceSentence: string,
  addedVia: BankEntry['addedVia'],
): Promise<BankEntry> {
  const db = await connect();
  const id = entryId(card.lemma, card.senseId);
  const existing = (await db.get(STORE, id)) as BankEntry | undefined;

  // Already banked: keep the first acquisition and its reuse history. An
  // "accepted" beats a "tapped", because adopting the word is the stronger act.
  const entry: BankEntry = existing
    ? {
        ...existing,
        addedVia: existing.addedVia === 'accepted' ? 'accepted' : addedVia,
      }
    : {
        id,
        word: card.word,
        lemma: card.lemma,
        partOfSpeech: card.partOfSpeech,
        senseId: card.senseId,
        definition: card.definition,
        synonyms: card.synonyms,
        useCases: card.useCases,
        register: card.register,
        sourceSentence,
        addedVia,
        addedAt: new Date().toISOString(),
        timesReused: 0,
        lastReusedAt: null,
      };

  await db.put(STORE, entry);
  return entry;
}

export async function listBank(): Promise<BankEntry[]> {
  const db = await connect();
  const all = (await db.getAll(STORE)) as BankEntry[];
  return all.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export async function countBank(): Promise<number> {
  const db = await connect();
  return db.count(STORE);
}

/** Records that the writer used a banked word unprompted. */
export async function markReused(id: string): Promise<BankEntry | null> {
  const db = await connect();
  const entry = (await db.get(STORE, id)) as BankEntry | undefined;
  if (!entry) return null;

  const updated: BankEntry = {
    ...entry,
    timesReused: entry.timesReused + 1,
    lastReusedAt: new Date().toISOString(),
  };
  await db.put(STORE, updated);
  return updated;
}

export async function clearBank(): Promise<void> {
  const db = await connect();
  await db.clear(STORE);
}

/**
 * Checks freshly submitted text against the bank and records any word the
 * writer used again unprompted. Returns the entries that matched, so the UI
 * can say so — this is the product's only reward, and it fires on evidence of
 * transfer rather than on attendance.
 */
export async function recordReuse(text: string): Promise<BankEntry[]> {
  if (typeof indexedDB === 'undefined') return [];

  const entries = await listBank();
  if (entries.length === 0) return [];

  const matched = findReused(
    text,
    entries.map((entry) => entry.lemma),
  );
  if (matched.length === 0) return [];

  const hits = entries.filter((entry) => matched.includes(entry.lemma));
  const updated = await Promise.all(hits.map((entry) => markReused(entry.id)));
  return updated.filter((entry): entry is BankEntry => entry !== null);
}

/** Removes a word banked by mistake. */
export async function removeWord(id: string): Promise<void> {
  const db = await connect();
  await db.delete(STORE, id);
}

/**
 * Puts a removed word back exactly as it was.
 *
 * Deliberately not `bankWord`, which would mint a fresh `addedAt` and reset
 * `timesReused` — undoing a mistaken tap should not cost someone the evidence
 * that they have used the word three times since.
 */
export async function restoreWord(entry: BankEntry): Promise<void> {
  const db = await connect();
  await db.put(STORE, entry);
}

/**
 * The whole bank, in the shape a future import can read.
 *
 * Sorted by acquisition rather than by id so the file reads as a history — the
 * order someone met these words in is part of what they are backing up.
 */
export async function exportBank(): Promise<BankExport> {
  const entries = await listBank();

  return {
    version: BANK_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    entries: [...entries].sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
  };
}

/** Whether a word is already banked, so the UI can say "Saved" rather than offer it again. */
export async function isBanked(lemma: string, senseId: string): Promise<boolean> {
  const db = await connect();
  return (await db.get(STORE, entryId(lemma, senseId))) !== undefined;
}
