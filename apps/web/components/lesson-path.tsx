'use client';

import { LockIcon } from 'lucide-react';
import { LESSONS_TO_UNLOCK, UNITS, type LessonProgress, type UnitId } from '@auto-learn/shared';
import { cn } from '@/lib/utils';

/**
 * The seven units in order, each with how many of its five lessons are done.
 *
 * A locked unit stays a button marked `aria-disabled` rather than `disabled`,
 * so it is still reached by keyboard and screen reader and can say it is
 * locked; tapping it does nothing. Tapping an open one starts a lesson there.
 */
export function LessonPath({
  progress,
  onPick,
}: {
  progress: LessonProgress;
  onPick: (unit: UnitId) => void;
}) {
  return (
    <ol className="space-y-2" aria-label="Your path">
      {UNITS.map((unit) => {
        const locked = unit.id > progress.highestUnlocked;
        // Replays keep counting on the server; the path only needs "five done".
        const done = Math.min(progress.counts[String(unit.id)] ?? 0, LESSONS_TO_UNLOCK);

        return (
          <li key={unit.id}>
            <button
              type="button"
              aria-disabled={locked}
              onClick={() => !locked && onPick(unit.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                locked ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted',
              )}
            >
              <span className="w-5 shrink-0 text-sm text-muted-foreground">{unit.id}</span>
              <span className="flex-1">
                <span className="block font-medium">{unit.title}</span>
                <span className="block text-sm text-muted-foreground">{unit.goal}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                {locked && (
                  <>
                    <LockIcon aria-hidden className="size-3.5" />
                    <span className="sr-only">Locked,</span>
                  </>
                )}
                {done}/{LESSONS_TO_UNLOCK}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
