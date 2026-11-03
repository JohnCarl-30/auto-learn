import { describe, expect, it } from 'vitest';
import {
  highestUnlocked,
  lessonXp,
  manilaDate,
  nextReview,
  pathFinished,
  pickPrompt,
  streakDays,
  UNITS,
} from './lesson-path';

describe('UNITS', () => {
  it('has seven units with at least ten unique prompts each', () => {
    expect(UNITS.map((u) => u.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const u of UNITS) {
      expect(u.prompts.length).toBeGreaterThanOrEqual(10);
      expect(new Set(u.prompts.map((p) => p.id)).size).toBe(u.prompts.length);
    }
  });

  // Ids are stored with each completion, so a prompt that drifted out of its
  // unit's namespace would be remembered under the wrong unit.
  it('numbers every prompt id u<unit>-<nn> within its own unit', () => {
    for (const u of UNITS) {
      u.prompts.forEach((p, i) => {
        expect(p.id).toBe(`u${u.id}-${String(i + 1).padStart(2, '0')}`);
        expect(p.text.trim()).not.toBe('');
      });
    }
  });

  // The spec fixes these; pinning them stops a prompt-writing edit moving a timer.
  it('carries the timings and parts the spec fixes', () => {
    expect(
      UNITS.map((u) => [u.targetSeconds, u.retryTargetSeconds, u.prepSeconds, u.parts.length]),
    ).toEqual([
      [30, undefined, undefined, 1],
      [45, undefined, undefined, 3],
      [60, 20, undefined, 1],
      [60, undefined, undefined, 3],
      [60, undefined, undefined, 3],
      [30, undefined, 5, 2],
      [120, undefined, undefined, 3],
    ]);
  });
});

describe('nextReview', () => {
  const now = new Date('2026-11-03T00:00:00Z');
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();
  it('climbs one rung when right', () => {
    expect(nextReview(0, true, now)).toEqual({ step: 1, dueAt: days(1) });
    expect(nextReview(2, true, now)).toEqual({ step: 3, dueAt: days(7) });
  });
  it('stays on the top rung', () => {
    expect(nextReview(5, true, now)).toEqual({ step: 5, dueAt: days(30) });
  });
  it('drops to the start when wrong, due tomorrow', () => {
    expect(nextReview(4, false, now)).toEqual({ step: 0, dueAt: days(1) });
  });
});

describe('manilaDate', () => {
  it('uses the Manila calendar, not UTC', () => {
    expect(manilaDate(new Date('2026-11-03T15:30:00Z'))).toBe('2026-11-03'); // 23:30 Manila
    expect(manilaDate(new Date('2026-11-03T16:30:00Z'))).toBe('2026-11-04'); // 00:30 Manila
  });
});

describe('streakDays', () => {
  it('counts consecutive days ending today', () => {
    expect(streakDays(['2026-11-01', '2026-11-02', '2026-11-03'], '2026-11-03')).toBe(3);
  });
  it('keeps yesterday’s streak alive before today’s lesson', () => {
    expect(streakDays(['2026-11-01', '2026-11-02'], '2026-11-03')).toBe(2);
  });
  it('is zero after a missed day', () => {
    expect(streakDays(['2026-11-01'], '2026-11-03')).toBe(0);
  });
  it('ignores duplicates and order', () => {
    expect(streakDays(['2026-11-03', '2026-11-02', '2026-11-03'], '2026-11-03')).toBe(2);
  });
  it('crosses a month boundary', () => {
    expect(streakDays(['2026-10-31', '2026-11-01'], '2026-11-01')).toBe(2);
  });
});

describe('lessonXp', () => {
  it('is 10, +5 word, +5 retry', () => {
    expect(lessonXp({ wordCorrect: false, retried: false })).toBe(10);
    expect(lessonXp({ wordCorrect: true, retried: true })).toBe(20);
  });
});

describe('highestUnlocked / pathFinished', () => {
  it('starts at unit 1 and unlocks after five', () => {
    expect(highestUnlocked({})).toBe(1);
    expect(highestUnlocked({ 1: 4 })).toBe(1);
    expect(highestUnlocked({ 1: 5 })).toBe(2);
    expect(highestUnlocked({ 1: 9, 2: 5, 3: 1 })).toBe(3);
  });
  it('never passes 7', () => {
    const all = { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5 } as const;
    expect(highestUnlocked(all)).toBe(7);
    expect(pathFinished(all)).toBe(true);
    expect(pathFinished({ ...all, 7: 4 })).toBe(false);
  });
});

describe('pickPrompt', () => {
  it('prefers a prompt not done recently', () => {
    const unit = UNITS[0];
    const recent = unit.prompts.slice(0, -1).map((p) => p.id);
    expect(pickPrompt(unit, recent).id).toBe(unit.prompts.at(-1)!.id);
  });
  it('falls back to the least recently done when all are recent', () => {
    const unit = UNITS[0];
    const recent = unit.prompts.map((p) => p.id); // newest first
    expect(pickPrompt(unit, recent).id).toBe(recent.at(-1));
  });
});
