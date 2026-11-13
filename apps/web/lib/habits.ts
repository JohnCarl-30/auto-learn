import type { SpokenResult } from './use-lesson';

/**
 * How you speak, tracked answer by answer: four numbers measured from each
 * spoken lesson answer, each folded into a running average so the picture
 * moves a little with every lesson. The weakest one is the day's focus.
 *
 * Counts only, never the words: the answer itself is not kept.
 */
export const SKILLS = ['pace', 'fillers', 'range', 'structure'] as const;
export type Skill = (typeof SKILLS)[number];

/** One answer, measured. `value` is the figure shown; `score` is 0 to 1, higher better. */
export type Reading = Record<Skill, { value: number; score: number }>;

export interface Habits {
  answers: number;
  /** Running averages; `before` is the score ahead of the latest answer, for the trend. */
  skills: Record<Skill, { value: number; score: number; before: number | null }>;
}

/** Clear speech sits about here, in words a minute. */
const PACE = { low: 130, high: 160 };
/** How much the newest answer counts against everything before it. */
const WEIGHT = 0.3;
/** Shorter than this and the figures are noise. */
const MIN_WORDS = 10;
const WINDOW = 25;

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Share of different words, averaged over every 25-word stretch. A plain
 * unique-over-total ratio falls as an answer gets longer; this one does not.
 */
function variety(words: string[]): number {
  if (words.length <= WINDOW) return new Set(words).size / words.length;
  let sum = 0;
  const stretches = words.length - WINDOW + 1;
  for (let start = 0; start < stretches; start += 1) {
    sum += new Set(words.slice(start, start + WINDOW)).size / WINDOW;
  }
  return sum / stretches;
}

/** Null for a typed answer (nothing was spoken) or one too short to measure. */
export function measure(attempt: SpokenResult): Reading | null {
  const words = attempt.answer.toLowerCase().match(/[a-z']+/g) ?? [];
  if (!attempt.seconds || words.length < MIN_WORDS) return null;

  const pace = words.length / (attempt.seconds / 60);
  const off = Math.max(PACE.low - pace, pace - PACE.high, 0);
  const fillers = (attempt.fillers.total / words.length) * 100;
  const range = variety(words);
  const { pointFirst, parts } = attempt.feedback;
  const heard = parts.filter((part) => part.quote).length;
  const structure = parts.length
    ? (Number(pointFirst) + heard / parts.length) / 2
    : Number(pointFirst);

  return {
    pace: { value: pace, score: 1 - clamp(off / 60) },
    // Eight fillers in a hundred words is every other sentence.
    fillers: { value: fillers, score: 1 - clamp(fillers / 8) },
    range: { value: range, score: clamp((range - 0.6) / 0.3) },
    structure: { value: structure, score: structure },
  };
}

/** Folds one answer into the running averages. */
export function update(habits: Habits | null, reading: Reading): Habits {
  const blend = (old: number | undefined, next: number) =>
    old === undefined ? next : old + WEIGHT * (next - old);

  const skills = {} as Habits['skills'];
  for (const skill of SKILLS) {
    const old = habits?.skills[skill];
    skills[skill] = {
      value: blend(old?.value, reading[skill].value),
      score: blend(old?.score, reading[skill].score),
      before: old?.score ?? null,
    };
  }
  return { answers: (habits?.answers ?? 0) + 1, skills };
}

/** The skill to work on: the lowest running score. */
export function focus(habits: Habits): Skill {
  return SKILLS.reduce((weakest, skill) =>
    habits.skills[skill].score < habits.skills[weakest].score ? skill : weakest,
  );
}

// shortcut: kept in this browser only, so a phone and a laptop each have their own; move to the account when habits should follow you.
const KEY = 'auto-learn:habits';

export function loadHabits(): Habits | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Habits | null;
    return stored && SKILLS.every((skill) => typeof stored.skills?.[skill]?.score === 'number')
      ? stored
      : null;
  } catch {
    return null;
  }
}

/** Measures the answer, saves the new averages, and returns them (or what was there). */
export function recordAnswer(attempt: SpokenResult): Habits | null {
  const reading = measure(attempt);
  const habits = loadHabits();
  if (!reading) return habits;

  const next = update(habits, reading);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full store: this lesson still shows its own figures.
  }
  return next;
}
