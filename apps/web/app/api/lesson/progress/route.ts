import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/dal';
import { readProgress } from '@/lib/lesson-store';

/**
 * The signed-in learner's lesson state: XP, streak, unlocked units, the prompts
 * they have seen lately and the words due for review.
 *
 * Read on every visit to the path rather than cached on the client, so the
 * streak a second device shows is never a day stale.
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  try {
    return NextResponse.json(await readProgress(user.id, new Date()), {
      // Somebody's own history. Never a cache, anywhere.
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    // An unreachable database or a schema that was never migrated. The lesson
    // itself needs none of this, so the client can carry on and try again.
    console.error('lesson progress failed', error);
    return NextResponse.json({ error: 'progress_failed' }, { status: 503 });
  }
}
