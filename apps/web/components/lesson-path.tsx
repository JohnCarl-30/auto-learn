'use client';

import { CheckIcon, LockIcon } from 'lucide-react';
import { LESSONS_TO_UNLOCK, UNITS, type LessonProgress, type UnitId } from '@auto-learn/shared';
import { SKILLS, focus, type Habits, type Skill } from '@/lib/habits';
import { cn } from '@/lib/utils';

const LABEL = 'font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground';

/** Beside the lesson: the streak, then the seven units. */
export function LessonRail({
  progress,
  habits,
  current,
  onPick,
}: {
  progress: LessonProgress;
  /** Absent until one spoken answer has been measured in this browser. */
  habits?: Habits | null;
  current?: UnitId;
  onPick: (unit: UnitId) => void;
}) {
  return (
    <div className="space-y-6">
      <StreakCard progress={progress} />
      {habits && <SpeakingHabits habits={habits} />}
      <LessonPath progress={progress} current={current} onPick={onPick} />
    </div>
  );
}

/**
 * The streak, and the last seven days it covers, today last. The server keeps
 * the streak's length, not a calendar, so the bars are worked out from it: it
 * runs back from today once today's lesson is done, and from yesterday until
 * then, which leaves today's bar open as the one still to fill.
 */
function StreakCard({ progress }: { progress: LessonProgress }) {
  const today = progress.doneToday > 0;

  return (
    <div className="flex items-end justify-between rounded-md bg-neutral-950 p-5 text-white">
      <div>
        <p className="font-display text-[44px] leading-[44px] font-semibold tracking-[-0.03em]">
          {progress.streak}
        </p>
        <p className="text-[13px] text-white/75">day streak</p>
      </div>
      <div className="flex items-end gap-1" aria-hidden>
        {Array.from({ length: 7 }, (_, index) => {
          const daysAgo = 6 - index;
          const done = today ? daysAgo < progress.streak : daysAgo > 0 && daysAgo <= progress.streak;
          return (
            <span
              key={index}
              data-testid="streak-day"
              data-done={done}
              className={cn(
                'h-[18px] w-2.5 rounded-[2px]',
                done ? 'bg-cobalt' : 'border-[1.5px] border-white/40',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

const SKILL_LABELS: Record<Skill, string> = {
  pace: 'Pace',
  fillers: 'Fillers',
  range: 'Word variety',
  structure: 'Structure',
};

/** What to try next time, said as the one thing to do. */
function advice(skill: Skill, value: number): string {
  switch (skill) {
    case 'pace':
      return value < 130
        ? 'Pick up the pace a little.'
        : 'Slow down, and leave room between points.';
    case 'fillers':
      return 'Pause instead of filling the gap.';
    case 'range':
      return 'Reach for a different word the second time.';
    case 'structure':
      return 'Lead with your point, then back it.';
  }
}

function figure(skill: Skill, value: number): string {
  switch (skill) {
    case 'pace':
      return `${Math.round(value)} words a minute`;
    case 'fillers':
      return `${value.toFixed(1)} per 100 words`;
    default:
      return `${Math.round(value * 100)}%`;
  }
}

/**
 * The running picture of how you speak, and the one thing to work on. A trend
 * is only shown once it has moved enough to be more than one answer's noise.
 */
function SpeakingHabits({ habits }: { habits: Habits }) {
  const weakest = focus(habits);

  return (
    <section aria-label="Your speaking" data-testid="speaking-habits">
      <p className={cn(LABEL, 'pb-2.5')} aria-hidden>
        Your speaking
      </p>
      <ul>
        {SKILLS.map((skill) => {
          const { value, score, before } = habits.skills[skill];
          const moved = before === null ? 0 : score - before;
          const here = skill === weakest;

          return (
            <li
              key={skill}
              className={cn('border-t px-3 py-3 text-[13px]', here && 'bg-cobalt-wash')}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn('text-[15px] font-semibold', here && 'text-cobalt')}>
                  {SKILL_LABELS[skill]}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {figure(skill, value)}
                  {Math.abs(moved) > 0.02 && (
                    <span className="sr-only">{moved > 0 ? ', improving' : ', slipping'}</span>
                  )}
                  {Math.abs(moved) > 0.02 && <span aria-hidden>{moved > 0 ? ' ↑' : ' ↓'}</span>}
                </span>
              </div>
              {here && <p data-testid="speaking-focus">Focus: {advice(skill, value)}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The seven units in order, each with how many of its five lessons are done.
 *
 * A locked unit stays a button marked `aria-disabled` rather than `disabled`,
 * so it is still reached by keyboard and screen reader and can say it is
 * locked; tapping it does nothing. Tapping an open one starts a lesson there.
 */
export function LessonPath({
  progress,
  current,
  onPick,
}: {
  progress: LessonProgress;
  /** The unit of the lesson on screen, marked as where you are. */
  current?: UnitId;
  onPick: (unit: UnitId) => void;
}) {
  return (
    <div>
      <p className={cn(LABEL, 'pb-2.5')} aria-hidden>
        Your path
      </p>
      <ol aria-label="Your path">
        {UNITS.map((unit) => {
          const locked = unit.id > progress.highestUnlocked;
          // Replays keep counting on the server; the path only needs "five done".
          const done = Math.min(progress.counts[String(unit.id)] ?? 0, LESSONS_TO_UNLOCK);
          const finished = done === LESSONS_TO_UNLOCK;
          const here = unit.id === current;

          return (
            <li key={unit.id} className="border-t">
              <button
                type="button"
                aria-disabled={locked}
                aria-current={here ? 'step' : undefined}
                onClick={() => !locked && onPick(unit.id)}
                className={cn(
                  'flex w-full items-start gap-3 px-3 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  locked ? 'cursor-not-allowed opacity-50' : 'hover:bg-cobalt-wash',
                  here && 'bg-cobalt-wash',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full font-mono text-[13px]',
                    here
                      ? 'bg-cobalt font-semibold text-white'
                      : finished
                        ? 'bg-foreground text-background'
                        : 'border border-neutral-400 text-muted-foreground',
                  )}
                >
                  {finished && !here ? <CheckIcon className="size-3.5" /> : unit.id}
                </span>
                <span className="flex-1">
                  <span className={cn('block text-[15px] font-semibold', here && 'text-cobalt')}>
                    {unit.title}
                  </span>
                  <span
                    className={cn('block text-[13px]', !here && 'text-muted-foreground')}
                  >
                    {unit.goal}
                  </span>
                </span>
                <span
                  className={cn(
                    'flex w-8 shrink-0 justify-end pt-0.5 font-mono text-xs',
                    here ? 'text-cobalt' : 'text-muted-foreground',
                  )}
                >
                  {locked ? (
                    <>
                      <LockIcon aria-hidden className="size-3.5" />
                      <span className="sr-only">
                        Locked, {done}/{LESSONS_TO_UNLOCK}
                      </span>
                    </>
                  ) : (
                    `${done}/${LESSONS_TO_UNLOCK}`
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
