import 'server-only';
import {
  highestUnlocked,
  lessonXp,
  manilaDate,
  nextReview,
  pathFinished,
  streakDays,
  type LessonCompleteRequest,
  type LessonProgress,
  type UnitId,
} from '@auto-learn/shared';
import { pool } from '@/lib/db';

/**
 * One person's lesson state, on the server.
 *
 * Nothing here is stored as a running total. Progress is derived from the
 * completions table on every read, so the streak, the XP and the unlocked unit
 * cannot disagree with the lessons they are counted from, and a lesson recorded
 * on a phone shows on a laptop with no sync step in between.
 *
 * `now` is passed in rather than read, so the day a lesson lands on and the day
 * the streak is measured against come from one instant.
 */

/** How many recent prompt ids a progress read returns; the contract's cap. */
const RECENT_PROMPTS = 20;

/** A lesson opens with at most this many due words, so it never starts with a pile. */
const DUE_PER_LESSON = 3;

export async function readProgress(
  userId: string,
  now: Date,
): Promise<LessonProgress> {
  // Four independent reads, so run side by side: this is on the path of every
  // lesson screen, and a round trip each in series would be felt on a phone.
  const [units, days, recent, due] = await Promise.all([
    // Per unit: how many lessons, and what they paid. The XP total is the sum
    // of the column across units, so one query serves both.
    pool().query<{ unit: number; lessons: number; xp: number }>(
      `select unit, count(*)::int as lessons, sum(xp)::int as xp
         from lesson_completions
        where user_id = $1
        group by unit`,
      [userId],
    ),
    // Per Manila day. Cast to text: node-postgres turns a `date` into a JS Date
    // at local midnight, and the streak compares plain 'YYYY-MM-DD' strings.
    pool().query<{ day: string; lessons: number }>(
      `select manila_date::text as day, count(*)::int as lessons
         from lesson_completions
        where user_id = $1
        group by manila_date`,
      [userId],
    ),
    pool().query<{ prompt_id: string }>(
      `select prompt_id
         from lesson_completions
        where user_id = $1
        order by completed_at desc
        limit $2`,
      [userId, RECENT_PROMPTS],
    ),
    // Never reviewed (null) counts as due now and sorts first, then the most
    // overdue; `added_at` breaks ties so a fresh bank is worked oldest first.
    pool().query<{ id: string }>(
      `select id
         from bank_entries
        where user_id = $1
          and (review_due_at is null or review_due_at <= $2)
        order by review_due_at nulls first, added_at
        limit $3`,
      [userId, now, DUE_PER_LESSON],
    ),
  ]);

  // `counts` goes out keyed by the unit number as a string (JSON keys are
  // strings); the shared helpers want the same data keyed by `UnitId`. The
  // table's CHECK keeps `unit` within 1–7, which is what makes the cast true.
  const counts: Record<string, number> = {};
  const countsByUnit: Partial<Record<UnitId, number>> = {};
  let xp = 0;
  for (const row of units.rows) {
    counts[String(row.unit)] = row.lessons;
    countsByUnit[row.unit as UnitId] = row.lessons;
    xp += row.xp;
  }

  const today = manilaDate(now);

  return {
    xp,
    streak: streakDays(
      days.rows.map((row) => row.day),
      today,
    ),
    doneToday: days.rows.find((row) => row.day === today)?.lessons ?? 0,
    counts,
    highestUnlocked: highestUnlocked(countsByUnit),
    pathFinished: pathFinished(countsByUnit),
    recentPromptIds: recent.rows.map((row) => row.prompt_id),
    dueEntryIds: due.rows.map((row) => row.id),
  };
}

/**
 * Records a finished lesson.
 *
 * The XP is worked out here from the two flags and never read from the request,
 * so a client cannot pay itself more than a lesson is worth. The Manila date is
 * written down with the row for the reason given in schema.sql.
 *
 * Not idempotent: a replayed request is a second lesson. Several a day are
 * allowed, and the request carries nothing that tells a retry from a repeat.
 */
export async function recordCompletion(
  userId: string,
  input: LessonCompleteRequest,
  now: Date,
): Promise<void> {
  await pool().query(
    `insert into lesson_completions
       (user_id, completed_at, manila_date, unit, prompt_id, xp)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      now,
      manilaDate(now),
      input.unit,
      input.promptId,
      lessonXp({ wordCorrect: input.wordCorrect, retried: input.retried }),
    ],
  );
}

/**
 * Moves a banked word along the review ladder.
 *
 * Returns false when this person has no such word, which the route turns into a
 * 404: a stale id from a device that has not synced is the likely cause, and it
 * should not read as a server failure.
 *
 * Read then write rather than one statement, because the ladder lives in
 * `nextReview` and is not duplicated in SQL. Two answers to the same word at the
 * same instant could both read one step, but they would write the same next
 * rung, so the race costs nothing.
 */
export async function recordReview(
  userId: string,
  entryId: string,
  right: boolean,
  now: Date,
): Promise<boolean> {
  const { rows } = await pool().query<{ review_step: number }>(
    `select review_step
       from bank_entries
      where user_id = $1 and id = $2`,
    [userId, entryId],
  );
  if (rows.length === 0) return false;

  const next = nextReview(rows[0].review_step, right, now);

  // `synced_at` is left alone: it records when the bank sync last wrote the row,
  // and a review is not part of that.
  await pool().query(
    `update bank_entries
        set review_step = $3, review_due_at = $4
      where user_id = $1 and id = $2`,
    [userId, entryId, next.step, next.dueAt],
  );
  return true;
}
