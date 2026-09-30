import { NextResponse } from 'next/server';
import {
  BankSyncRequest,
  MAX_SYNC_ENTRIES,
  mergeSyncedLists,
  type BankSyncResponse,
} from '@auto-learn/shared';
import { currentUser } from '@/lib/dal';
import { readBank, writeBank } from '@/lib/bank-store';

/**
 * Reconciles this browser's bank with the account's, in one round trip.
 *
 * The client sends what it has; the server merges it with what it holds, stores
 * the result, and returns the whole reconciled bank. That makes one endpoint do
 * three jobs that would otherwise be three: claiming a bank for the first time
 * (the server has nothing, so the merge is an upload), picking it up on a new
 * device (the client has nothing, so the merge is a download), and settling two
 * devices that both moved.
 *
 * Idempotent by construction — the merge of a bank with itself is itself — so a
 * retry after a dropped connection is safe, which matters on the phones this is
 * mostly used on.
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

  const parsed = BankSyncRequest.safeParse(body);
  if (!parsed.success) {
    // The cap is the likeliest reason and the only one the caller can act on.
    return NextResponse.json(
      { error: 'invalid_bank', limit: MAX_SYNC_ENTRIES },
      { status: 400 },
    );
  }

  try {
    const stored = await readBank(user.id);
    const merged = mergeSyncedLists(stored, parsed.data.entries);

    // Written even when nothing changed, which keeps this simple and costs one
    // statement. Worth revisiting only if a sync ever becomes frequent.
    await writeBank(user.id, merged);

    const response: BankSyncResponse = {
      entries: merged,
      syncedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      // Somebody's own words. Never a cache, anywhere.
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    // A database that is unreachable or a schema that was never migrated. The
    // local bank is untouched and authoritative, so this is a retry rather than
    // a loss — which is what the client is told.
    console.error('bank sync failed', error);
    return NextResponse.json({ error: 'sync_failed' }, { status: 503 });
  }
}
