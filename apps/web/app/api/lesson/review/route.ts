import { NextResponse } from 'next/server';
import { ReviewAnswerRequest } from '@auto-learn/shared';
import { currentUser } from '@/lib/dal';
import { recordReview } from '@/lib/lesson-store';

/**
 * Records one answer in the word review, which moves that word up or back down
 * the review ladder and sets when it is next due.
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

  const parsed = ReviewAnswerRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_review' }, { status: 400 });
  }

  try {
    const found = await recordReview(
      user.id,
      parsed.data.entryId,
      parsed.data.right,
      new Date(),
    );
    if (!found) {
      // Most likely a word banked on a device that has not synced yet. Not a
      // server fault, and not worth a retry.
      return NextResponse.json({ error: 'no_such_word' }, { status: 404 });
    }

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('lesson review failed', error);
    return NextResponse.json({ error: 'review_failed' }, { status: 503 });
  }
}
