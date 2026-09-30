'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { countBank } from '@/lib/bank';
import { syncBank } from '@/lib/sync';

type State =
  | { status: 'counting' }
  | { status: 'syncing'; total: number | null }
  | { status: 'synced'; total: number; at: string }
  | { status: 'failed'; total: number | null };

/**
 * How many words are banked, and whether the account has them.
 *
 * Syncs once on mount, because someone who has just signed in on a new device
 * came here to find their words rather than to press a button. The button is for
 * the second time — after banking more words, or after a sync that failed.
 *
 * A failed sync is reported plainly and is not an emergency: the local bank is
 * untouched and is the copy in use. What must never appear here is a claim that
 * words are safe when the request did not land.
 */
export function BankSummary() {
  const [state, setState] = useState<State>({ status: 'counting' });

  const sync = useCallback(async (known: number | null) => {
    setState({ status: 'syncing', total: known });
    try {
      const { total, syncedAt } = await syncBank();
      setState({ status: 'synced', total, at: syncedAt });
    } catch {
      setState({ status: 'failed', total: known });
    }
  }, []);

  useEffect(() => {
    let live = true;

    countBank()
      .then((count) => {
        if (live) void sync(count);
      })
      // A browser with IndexedDB blocked or full. There is nothing to sync and
      // nothing useful to say beyond that.
      .catch(() => {
        if (live) setState({ status: 'failed', total: null });
      });

    return () => {
      live = false;
    };
  }, [sync]);

  const total = 'total' in state ? state.total : null;

  return (
    <div className="mt-2 space-y-3 text-sm">
      <p className="text-muted-foreground" data-testid="bank-count">
        {total === null
          ? 'Counting…'
          : total === 1
            ? '1 word banked.'
            : `${total} words banked.`}
      </p>

      <p className="text-xs text-muted-foreground" data-testid="bank-sync">
        {state.status === 'counting' || state.status === 'syncing' ? (
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircleIcon className="size-3 animate-spin" />
            Syncing with your account…
          </span>
        ) : state.status === 'synced' ? (
          <>
            Synced to your account. They&apos;ll be here when you sign in
            somewhere else.
          </>
        ) : (
          <>
            Couldn&apos;t reach your account just now, so these words are only in
            this browser. Nothing was lost — try again.
          </>
        )}
      </p>

      {state.status === 'failed' && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="bank-retry"
          onClick={() => void sync(total)}
        >
          Try again
        </Button>
      )}

      {state.status === 'synced' && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="bank-resync"
          onClick={() => void sync(total)}
        >
          Sync now
        </Button>
      )}

      {/*
        The sentence each word was met in is the one thing that stays here. Said
        out loud because it is a promise, and because someone who finds a word on
        a new device with no sentence under it should know that was the deal
        rather than a bug.
      */}
      <p className="text-xs text-muted-foreground">
        Your words sync. The sentences you wrote them in stay on the device you
        wrote them on.
      </p>
    </div>
  );
}
