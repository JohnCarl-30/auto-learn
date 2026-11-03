'use client';

import {
  LessonProgress,
  type LessonCompleteRequest,
  type ReviewAnswerRequest,
} from '@auto-learn/shared';

/**
 * The lesson's own-origin calls: progress, completions and word reviews.
 *
 * Same-origin like `syncBank`, not through the API, because these are account
 * data and the web app is the side that owns accounts. The session cookie
 * carries who is asking, so there is no token here.
 */

/**
 * A refusal, with its status kept so the caller can tell "signed out" (401)
 * from "the database is down" (503) without reading the body.
 */
export class LessonRequestFailed extends Error {
  constructor(readonly status: number) {
    super(`lesson request refused with ${status}`);
    this.name = 'LessonRequestFailed';
  }
}

async function request(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
    // Explicit, as in sync.ts: a move to another host should fail loudly here.
    credentials: 'same-origin',
  });

  if (!response.ok) throw new LessonRequestFailed(response.status);
  return response.json();
}

/** XP, streak, unlocked units, recent prompts and the words due for review. */
export async function fetchProgress(): Promise<LessonProgress> {
  // Parsed, not trusted: a drifted shape fails here, not as a blank path.
  return LessonProgress.parse(await request('/api/lesson/progress'));
}

/**
 * Records a finished lesson. Not idempotent: each call is another lesson and
 * more XP, so callers must never retry it blindly (see `useLesson().finish`).
 */
export async function completeLesson(
  body: LessonCompleteRequest,
): Promise<LessonProgress> {
  return LessonProgress.parse(await request('/api/lesson/complete', body));
}

/** Moves one word up or back down the review ladder. */
export async function answerReview(body: ReviewAnswerRequest): Promise<void> {
  await request('/api/lesson/review', body);
}
