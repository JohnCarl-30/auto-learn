'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { syncBank } from './sync';

/**
 * Pulls the account's bank into this browser, once, on arrival.
 *
 * Returns a counter that changes when a sync has landed, to be folded into the
 * version `useBank` re-reads on. Without it, signing in on a new device shows an
 * empty bank until something else happened to write to IndexedDB — the words are
 * on the server and simply never fetched.
 *
 * Once per mount, tracked in a ref rather than by dependency, because `status`
 * settles through `loading` and a dependency on it would sync twice.
 *
 * A failure is logged and otherwise ignored *here*. Every word is already in
 * this browser and the product works untouched without the server; the account
 * page is where sync state is reported and where a retry lives, because that is
 * where someone goes when they want to know. Interrupting a writer mid-sentence
 * with a toast about a background request would be the wrong trade.
 */
export function useBankSync(): number {
  const { status } = useSession();
  const [version, setVersion] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || started.current) return;
    started.current = true;

    syncBank()
      .then(() => setVersion((value) => value + 1))
      .catch((error) => console.error('background bank sync failed', error));
  }, [status]);

  return version;
}
