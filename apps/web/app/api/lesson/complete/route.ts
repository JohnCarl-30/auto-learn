import { NextResponse } from 'next/server';
import { LessonCompleteRequest } from '@auto-learn/shared';
import { currentUser } from '@/lib/dal';
import { readProgress, recordCompletion } from '@/lib/lesson-store';

/**
 * Records a finished lesson and answers with the refreshed progress, so the
 * results screen can show the new XP and streak without a second request.
 *
 * The request names the unit, the prompt and two flags. It does not carry XP:
 * the store works that out, so the number is not the client's to set.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'malformed_body' }, { status: 400 });
  }

  const parsed = LessonCompleteRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_completion' }, { status: 400 });
  }

  try {
    // One instant for the row and for the read after it, so the lesson just
    // recorded is always counted in the day the streak is measured against.
    const now = new Date();
    await recordCompletion(user.id, parsed.data, now);

    return NextResponse.json(await readProgress(user.id, now), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    // Either the insert failed (nothing recorded) or only the read after it did
    // (lesson saved). The response cannot say which, so a client that wants to
    // be sure fetches progress before re-sending.
    console.error('lesson complete failed', error);
    return NextResponse.json({ error: 'complete_failed' }, { status: 503 });
  }
}
