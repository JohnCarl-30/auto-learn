import 'server-only';
import { SyncedEntry } from '@auto-learn/shared';
import { pool } from '@/lib/db';

/**
 * One person's bank, on the server.
 *
 * The row shape and the wire shape differ only in casing — snake_case in SQL,
 * camelCase over the network — so the mapping is mechanical and lives in the two
 * functions at the bottom rather than being spread through the queries.
 */

interface BankRow {
  id: string;
  word: string;
  lemma: string;
  part_of_speech: string;
  sense_id: string;
  definition: string;
  synonyms: unknown;
  use_cases: unknown;
  register: string;
  added_via: string;
  added_at: Date;
  times_reused: number;
  last_reused_at: Date | null;
}

export async function readBank(userId: string): Promise<SyncedEntry[]> {
  const { rows } = await pool().query<BankRow>(
    `select id, word, lemma, part_of_speech, sense_id, definition, synonyms,
            use_cases, register, added_via, added_at, times_reused,
            last_reused_at
       from bank_entries
      where user_id = $1
      order by added_at`,
    [userId],
  );

  return rows.flatMap(toEntry);
}

/**
 * Writes the reconciled bank.
 *
 * One statement for the whole list rather than a loop of upserts: a bank is a
 * few hundred rows at most, and a round trip each would make a sync on a phone
 * feel like a page load. `unnest` turns the arrays into rows Postgres can insert
 * in one pass.
 *
 * Nothing is deleted. A word missing from this list is a word the client did not
 * send, and the most likely reason is that the client is an older device that
 * never had it — not that someone removed it. Deletion needs its own signal, and
 * until there is one, silence must not destroy history.
 */
export async function writeBank(
  userId: string,
  entries: SyncedEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  await pool().query(
    `insert into bank_entries (
       user_id, id, word, lemma, part_of_speech, sense_id, definition,
       synonyms, use_cases, register, added_via, added_at, times_reused,
       last_reused_at, synced_at
     )
     select $1,
            entry.id, entry.word, entry.lemma, entry.part_of_speech,
            entry.sense_id, entry.definition,
            entry.synonyms::jsonb, entry.use_cases::jsonb,
            entry.register, entry.added_via, entry.added_at::timestamptz,
            entry.times_reused, entry.last_reused_at::timestamptz, now()
       from unnest(
              $2::text[],  $3::text[],  $4::text[],  $5::text[],
              $6::text[],  $7::text[],  $8::text[],  $9::text[],
              $10::text[], $11::text[], $12::text[], $13::int[],
              $14::text[]
            ) as entry(
              id, word, lemma, part_of_speech, sense_id, definition,
              synonyms, use_cases, register, added_via, added_at,
              times_reused, last_reused_at
            )
     on conflict (user_id, id) do update set
       word           = excluded.word,
       lemma          = excluded.lemma,
       part_of_speech = excluded.part_of_speech,
       sense_id       = excluded.sense_id,
       definition     = excluded.definition,
       synonyms       = excluded.synonyms,
       use_cases      = excluded.use_cases,
       register       = excluded.register,
       added_via      = excluded.added_via,
       added_at       = excluded.added_at,
       times_reused   = excluded.times_reused,
       last_reused_at = excluded.last_reused_at,
       synced_at      = now()`,
    [
      userId,
      entries.map((e) => e.id),
      entries.map((e) => e.word),
      entries.map((e) => e.lemma),
      entries.map((e) => e.partOfSpeech),
      entries.map((e) => e.senseId),
      entries.map((e) => e.definition),
      entries.map((e) => JSON.stringify(e.synonyms)),
      entries.map((e) => JSON.stringify(e.useCases)),
      entries.map((e) => e.register),
      entries.map((e) => e.addedVia),
      entries.map((e) => e.addedAt),
      entries.map((e) => e.timesReused),
      entries.map((e) => e.lastReusedAt),
    ],
  );
}

/**
 * A row, parsed rather than cast.
 *
 * `register`, `addedVia` and `partOfSpeech` are unions in the contract and plain
 * text in the table, and `synonyms` is whatever JSON was stored. A row written by
 * an older release — or by hand — must not travel back out as something the
 * client's own schema will reject mid-render, so anything that does not parse is
 * dropped here with a line in the log. One unreadable word is worth losing; a
 * bank that fails to load is not.
 */
function toEntry(row: BankRow): SyncedEntry[] {
  const parsed = SyncedEntry.safeParse({
    id: row.id,
    word: row.word,
    lemma: row.lemma,
    partOfSpeech: row.part_of_speech,
    senseId: row.sense_id,
    definition: row.definition,
    synonyms: row.synonyms,
    useCases: row.use_cases,
    register: row.register,
    addedVia: row.added_via,
    addedAt: row.added_at.toISOString(),
    timesReused: row.times_reused,
    lastReusedAt: row.last_reused_at?.toISOString() ?? null,
  });

  if (!parsed.success) {
    console.error(`bank row ${row.id} does not match the contract; skipping`);
    return [];
  }

  return [parsed.data];
}
