'use client';

import { useEffect, useState } from 'react';
import { countBank } from '@/lib/bank';

/**
 * How many words are banked, and where they actually are.
 *
 * Says the unglamorous thing on purpose. Signing in does not yet move the bank
 * anywhere — the words are still in this browser's IndexedDB, and someone who
 * signs in on a phone expecting to find them there should learn that here
 * rather than by finding an empty list. The account exists so that sync can be
 * built on it; until it is, saying so is the whole job of this component.
 *
 * Counted on the client because that is the only place the answer exists.
 */
export function BankSummary() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    countBank()
      .then((value) => {
        if (live) setCount(value);
      })
      // A browser with IndexedDB blocked or full. The page is still useful
      // without a number, so this stays quiet rather than throwing.
      .catch(() => {
        if (live) setCount(null);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="mt-2 space-y-2 text-sm text-muted-foreground">
      <p data-testid="bank-count">
        {count === null
          ? 'Counting…'
          : count === 1
            ? '1 word banked on this device.'
            : `${count} words banked on this device.`}
      </p>
      <p className="text-xs">
        Still stored in this browser only. Your account is what will let them
        follow you to another one — that part isn&apos;t built yet.
      </p>
    </div>
  );
}
