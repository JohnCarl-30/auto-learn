'use client';

import { BankSyncResponse, bankForSync } from '@auto-learn/shared';
import { applySynced, listBank } from '@/lib/bank';

export interface SyncResult {
  /** Words in this browser once the sync has been applied. */
  total: number;
  syncedAt: string;
}

/**
 * Reconciles this browser's bank with the account's.
 *
 * Deliberately a single call to our own origin rather than to the API: the API
 * has no user table and no database, and a bank is exactly the user data that
 * belongs on the side that owns accounts. The session cookie travels on its own,
 * so there is no token to mint here.
 *
 * Throws on failure, and callers are expected to let it fail visibly but
 * harmlessly — the local bank is untouched by a failed sync and remains the copy
 * someone is actually using. Nothing here deletes anything.
 */
export async function syncBank(): Promise<SyncResult> {
  // Stripped here, at the boundary that sends, rather than by whatever produced
  // the entries. Keeping the sentences local is a promise the product makes in
  // writing, and the function that builds the request body is the last place it
  // can be kept — so it guarantees the shape instead of trusting its input.
  const { entries, skipped } = bankForSync(await listBank());

  // Reported here rather than in the shared package, which has no runtime to log
  // to. A skipped word is a local record a newer schema cannot read; it stays in
  // this browser untouched and simply does not travel.
  if (skipped.length > 0) {
    console.error(`not syncing ${skipped.length} unreadable entries:`, skipped);
  }

  const response = await fetch('/api/bank/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
    // The session cookie is same-origin; this is explicit so a future move to a
    // different host fails loudly here rather than silently signing out.
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`sync refused with ${response.status}`);
  }

  // Parsed, not trusted: this comes back into IndexedDB, and a malformed record
  // written there outlives the request that wrote it.
  const body = BankSyncResponse.parse(await response.json());

  return {
    total: await applySynced(body.entries),
    syncedAt: body.syncedAt,
  };
}
