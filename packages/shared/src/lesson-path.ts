import { z } from 'zod';

/**
 * The daily-lesson path: seven units, the review ladder, the Manila-day streak
 * and XP. All of it is plain arithmetic over data written in this file, with no
 * model call and no I/O, so the web app (which owns the database) and the tests
 * both run the exact same rules, and a wrong streak is caught here rather than
 * on someone's phone at 00:30.
 */

/** Seven units, numbered from 1. The literal union keeps `UNITS[id - 1]` honest. */
export type UnitId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * For a request body that names a unit. It validates the range; Zod infers a
 * plain `number` from it, so a caller that has parsed one casts to `UnitId`.
 */
export const UnitIdSchema = z.number().int().min(1).max(7);

const LAST_UNIT: UnitId = 7;

export interface LessonUnit {
  id: UnitId;
  title: string;
  /** One line on what the unit practises, shown on the path. */
  goal: string;
  /**
   * The shape an answer in this unit should have, in order. The feedback step
   * looks for each part in the transcript and quotes where it found it.
   */
  parts: string[];
  /** How long the answer should run, in seconds. */
  targetSeconds: number;
  /** Unit 3 only: the same answer again, this short, on the retry. */
  retryTargetSeconds?: number;
  /** Unit 6 only: seconds to think before recording starts. */
  prepSeconds?: number;
  /**
   * At least ten per unit, so the five lessons that unlock the next unit do not
   * repeat. Each is about the learner's own life (projects, school, opinions,
   * everyday things) and never an essay topic: the skill being practised is
   * building a clear spoken answer, and that is easier when the content is
   * already in the speaker's head.
   */
  prompts: { id: string; text: string }[];
}

/** Index 0 is unit 1. */
export const UNITS: readonly LessonUnit[] = [
  {
    id: 1,
    title: 'Point first',
    goal: 'Say the main point in one sentence before anything else.',
    parts: ['point'],
    targetSeconds: 30,
    prompts: [
      { id: 'u1-01', text: 'What is the best thing you have built so far, and why?' },
      { id: 'u1-02', text: 'Which subject at school do you enjoy the most right now?' },
      { id: 'u1-03', text: 'What is one thing you would change about how you study?' },
      { id: 'u1-04', text: 'Where do you get your best work done, at home or somewhere else?' },
      { id: 'u1-05', text: 'What is your favourite way to spend a free weekend?' },
      { id: 'u1-06', text: 'What was the hardest bug you fixed recently?' },
      { id: 'u1-07', text: 'What do you want to do after you graduate?' },
      { id: 'u1-08', text: 'Which app do you open every day, and what makes it good?' },
      { id: 'u1-09', text: 'What is one habit that has helped you the most?' },
      { id: 'u1-10', text: 'What should a first-year student in your course know?' },
      { id: 'u1-11', text: 'What is your go-to meal when you are in a hurry?' },
      { id: 'u1-12', text: 'How do you usually get to school or work, and is it a good way?' },
    ],
  },
  {
    id: 2,
    title: 'Point, reason, example',
    goal: 'Back your point with one reason and one real example.',
    parts: ['point', 'reason', 'example'],
    targetSeconds: 45,
    prompts: [
      { id: 'u2-01', text: 'Should students learn to code before college? Give your view.' },
      { id: 'u2-02', text: 'Do you prefer working alone or in a team on a project?' },
      { id: 'u2-03', text: 'Is it worth paying for a tool you use every day?' },
      { id: 'u2-04', text: 'Are group projects at school fair to everyone in the group?' },
      { id: 'u2-05', text: 'Is a side project more useful than a class project?' },
      { id: 'u2-06', text: 'What is the most useful thing you learned this year?' },
      { id: 'u2-07', text: 'Is it better to reply to messages right away or in batches?' },
      { id: 'u2-08', text: 'Is it better to learn one programming language well or several a little?' },
      { id: 'u2-09', text: 'Is it okay for a student to use AI help on school work?' },
      { id: 'u2-10', text: 'Do you prefer online classes or classes in person?' },
      { id: 'u2-11', text: 'Is it better to rent near school or to commute from home?' },
      { id: 'u2-12', text: 'Is a good internship more important than good grades?' },
    ],
  },
  {
    id: 3,
    title: 'Say it shorter',
    goal: 'Say the same answer in a minute, then again in twenty seconds.',
    parts: ['point'],
    targetSeconds: 60,
    retryTargetSeconds: 20,
    prompts: [
      { id: 'u3-01', text: 'Tell me about your last project: what it does and why you made it.' },
      { id: 'u3-02', text: 'Describe a typical day for you as a student.' },
      { id: 'u3-03', text: 'Describe where you live and what it is like.' },
      { id: 'u3-04', text: 'Explain what you are studying and why you chose it.' },
      { id: 'u3-05', text: 'Tell me about a class you found difficult.' },
      { id: 'u3-06', text: 'Describe your favourite place to study.' },
      { id: 'u3-07', text: 'Tell me about someone who has influenced your career plans.' },
      { id: 'u3-08', text: 'Describe how you prepare for an exam.' },
      { id: 'u3-09', text: 'Tell me about the tools you use to code every day.' },
      { id: 'u3-10', text: 'Describe a project you worked on with other people.' },
      { id: 'u3-11', text: 'Tell me about your plans for the next year.' },
      { id: 'u3-12', text: 'Describe the best meal you had this month.' },
    ],
  },
  {
    id: 4,
    title: 'Explain it simply',
    goal: 'Explain something you know to someone who does not.',
    parts: ['what it is', 'why it matters', 'an everyday comparison'],
    targetSeconds: 60,
    prompts: [
      { id: 'u4-01', text: 'Explain what an API is to someone who does not code.' },
      { id: 'u4-02', text: 'Explain what a database is to your lola.' },
      { id: 'u4-03', text: 'Explain what Git does to a classmate from another course.' },
      { id: 'u4-04', text: 'Explain what a bug is to a ten-year-old.' },
      { id: 'u4-05', text: 'Explain what a server is to your parents.' },
      { id: 'u4-06', text: 'Explain what an AI chatbot is to a relative who has never used one.' },
      { id: 'u4-07', text: 'Explain what an operating system is to a friend who only uses a phone.' },
      { id: 'u4-08', text: 'Explain what a computer science student actually does to relatives at a family gathering.' },
      { id: 'u4-09', text: 'Explain what cloud storage is to someone who keeps everything on a flash drive.' },
      { id: 'u4-10', text: 'Explain what encryption is to a classmate who studies business.' },
      { id: 'u4-11', text: 'Explain how GCash works to someone who has only ever paid in cash.' },
      { id: 'u4-12', text: 'Explain what a password manager is and why you use one.' },
    ],
  },
  {
    id: 5,
    title: 'Tell a story',
    goal: 'Tell a short story: the situation, what you did, what happened.',
    parts: ['situation', 'what you did', 'what happened'],
    targetSeconds: 60,
    prompts: [
      { id: 'u5-01', text: 'Tell me about a time a project went wrong and what you did about it.' },
      { id: 'u5-02', text: 'Tell me about a time you had to learn something quickly.' },
      { id: 'u5-03', text: 'Tell me about a time you helped a classmate or a friend.' },
      { id: 'u5-04', text: 'Tell me about a time you nearly missed a deadline.' },
      { id: 'u5-05', text: 'Tell me about a time you disagreed with a teammate.' },
      { id: 'u5-06', text: 'Tell me about a time you were proud of something you made.' },
      { id: 'u5-07', text: 'Tell me about a time something went wrong while you were travelling.' },
      { id: 'u5-08', text: 'Tell me about a time you had to speak in front of people.' },
      { id: 'u5-09', text: 'Tell me about a time you made a mistake at school or at work.' },
      { id: 'u5-10', text: 'Tell me about a time the power or internet went out at a bad moment.' },
      { id: 'u5-11', text: 'Tell me about a time you tried something for the first time.' },
      { id: 'u5-12', text: 'Tell me about a time you asked for help and got it.' },
    ],
  },
  {
    id: 6,
    title: 'Think on your feet',
    goal: 'Answer a question you did not expect, after five seconds to think.',
    parts: ['point', 'reason'],
    targetSeconds: 30,
    prepSeconds: 5,
    prompts: [
      { id: 'u6-01', text: 'If you could keep only one app on your phone, which would it be?' },
      { id: 'u6-02', text: 'Would you rather have a quiet weekend or a busy one?' },
      { id: 'u6-03', text: 'What is the most overrated thing in tech right now?' },
      { id: 'u6-04', text: 'Would you rather work from home or in an office?' },
      { id: 'u6-05', text: 'What is one rule you would add to your school?' },
      { id: 'u6-06', text: 'If you had a free day tomorrow, what would you do first?' },
      { id: 'u6-07', text: 'Rice or bread for breakfast?' },
      { id: 'u6-08', text: 'When you start a project, which matters more, speed or quality?' },
      { id: 'u6-09', text: 'Would you rather be a very good coder or a very good speaker?' },
      { id: 'u6-10', text: 'What is one thing every student should own?' },
      { id: 'u6-11', text: 'Is it better to wake up early or stay up late?' },
      { id: 'u6-12', text: 'What would you do with an extra hour every day?' },
    ],
  },
  {
    id: 7,
    title: 'Short talk',
    goal: 'Give a two-minute talk with an opening line and a closing line.',
    parts: ['opening line', 'point', 'closing line'],
    targetSeconds: 120,
    prompts: [
      { id: 'u7-01', text: 'Give a short talk on why you chose to study computer science.' },
      { id: 'u7-02', text: 'Give a short talk on what your biggest project taught you.' },
      { id: 'u7-03', text: 'Give a short talk on how a student can use their time better.' },
      { id: 'u7-04', text: 'Give a short talk on the best advice you have ever received.' },
      { id: 'u7-05', text: 'Give a short talk on what you want your first job to be like.' },
      { id: 'u7-06', text: 'Give a short talk on why students should build things outside of class.' },
      { id: 'u7-07', text: 'Give a short talk on what makes a good teammate.' },
      { id: 'u7-08', text: 'Give a short talk on how you handle stress around exams and deadlines.' },
      { id: 'u7-09', text: 'Give a short talk on your hometown and what a visitor should know.' },
      { id: 'u7-10', text: 'Give a short talk recommending one tool or habit to other students.' },
      { id: 'u7-11', text: 'Give a short talk on what you hope to be doing in five years.' },
      { id: 'u7-12', text: 'Give a short talk on the hardest thing you learned and how you got through it.' },
    ],
  },
];

/**
 * The review ladder, in days. A word on rung N comes back after
 * `REVIEW_INTERVALS_DAYS[N - 1]` days; a right answer climbs, a wrong one starts
 * the climb again. Simple enough to reason about and to test; SM-2 can replace
 * it if it feels wrong in use.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

const DAY_MS = 86_400_000;

/**
 * Where a banked word goes after a review answer.
 *
 * `step` is how many rungs the word has climbed: 0 for a word never reviewed or
 * just got wrong, `REVIEW_INTERVALS_DAYS.length` at the top, where it stays and
 * keeps coming back every 30 days. A wrong answer returns to step 0 and is due
 * tomorrow, the same as the first rung, so that a lapse is looked at again soon
 * but not on the same day it was missed.
 */
export function nextReview(
  step: number,
  right: boolean,
  now: Date,
): { step: number; dueAt: string } {
  const next = right ? Math.min(step + 1, REVIEW_INTERVALS_DAYS.length) : 0;
  const days = REVIEW_INTERVALS_DAYS[Math.max(next - 1, 0)];
  return { step: next, dueAt: new Date(now.getTime() + days * DAY_MS).toISOString() };
}

// Built once: constructing an Intl formatter is far dearer than calling one.
// `en-CA` is chosen for its output, which is already `YYYY-MM-DD`.
const manilaFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The calendar day, in Manila, that an instant falls on.
 *
 * The streak is counted in the learner's own day, not UTC's: a lesson at 00:30
 * Manila time is already tomorrow's, though UTC still calls it yesterday.
 * Asia/Manila has no daylight saving, so a day is always 24 hours long.
 */
export function manilaDate(at: Date): string {
  return manilaFormat.format(at);
}

/**
 * `YYYY-MM-DD` moved by whole days, computed at UTC noon so that no offset can
 * tip the result into the neighbouring day.
 */
function shiftDay(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Consecutive Manila days with a completed lesson, ending today.
 *
 * Today not having a lesson yet does not break the streak: the count then starts
 * from yesterday, so the streak shown in the morning is the one the learner is
 * about to extend. Only a whole missed day resets it to zero. Order and
 * duplicates in `completedDates` do not matter, since several lessons a day are
 * allowed and the database returns them in no promised order.
 */
export function streakDays(completedDates: string[], today: string): number {
  const days = new Set(completedDates);
  let day = days.has(today) ? today : shiftDay(today, -1);
  let count = 0;
  while (days.has(day)) {
    count += 1;
    day = shiftDay(day, -1);
  }
  return count;
}

/**
 * 10 for finishing a lesson, +5 for using the day's word correctly, +5 for the
 * retry. Nothing is ever taken away: a lesson with neither bonus still pays.
 */
export function lessonXp(flags: { wordCorrect: boolean; retried: boolean }): number {
  return 10 + (flags.wordCorrect ? 5 : 0) + (flags.retried ? 5 : 0);
}

/** Completed lessons in a unit before the next one opens. */
export const LESSONS_TO_UNLOCK = 5;

type UnitCounts = Partial<Record<UnitId, number>>;

/**
 * The newest unit the learner may start. Units open strictly in order, so this
 * stops at the first unit whose five lessons are not yet done, however many
 * later lessons have been counted (replaying an earlier unit does not skip one).
 */
export function highestUnlocked(counts: UnitCounts): UnitId {
  let unit: UnitId = 1;
  while (unit < LAST_UNIT && (counts[unit] ?? 0) >= LESSONS_TO_UNLOCK) {
    unit = (unit + 1) as UnitId;
  }
  return unit;
}

/** Unit 7 has no successor to unlock, so the path ends when its five are done. */
export function pathFinished(counts: UnitCounts): boolean {
  return (counts[LAST_UNIT] ?? 0) >= LESSONS_TO_UNLOCK;
}

/**
 * A prompt for a lesson, steering clear of ones done lately.
 *
 * `recentPromptIds` is newest first. The first prompt not in it wins, which
 * walks the unit in written order instead of leaving a repeat to chance (and
 * keeps this pure). When every prompt is recent, the one done longest ago is
 * the one furthest down the list. Ids from other units in the list are ignored.
 */
export function pickPrompt(
  unit: LessonUnit,
  recentPromptIds: string[],
): { id: string; text: string } {
  const fresh = unit.prompts.find((p) => !recentPromptIds.includes(p.id));
  if (fresh) return fresh;
  return unit.prompts.reduce((oldest, p) =>
    recentPromptIds.indexOf(p.id) > recentPromptIds.indexOf(oldest.id) ? p : oldest,
  );
}
