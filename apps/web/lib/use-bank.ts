'use client';

import { useEffect, useState } from 'react';
import type { BankEntry } from '@auto-learn/shared';
import { countBank, listBank } from './bank';

/**
 * Reads the bank, re-reading whenever `version` changes — the review hook
 * bumps it after every write, which is what makes the bank visibly grow.
 *
 * The read is guarded against completing after the effect is torn down: two
 * writes in quick succession would otherwise race, and the slower read could
 * land last and show stale contents.
 */
export function useBank(version: number) {
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    // IndexedDB does not exist during SSR.
    if (typeof indexedDB === 'undefined') return;

    let live = true;

    void (async () => {
      const [all, total] = await Promise.all([listBank(), countBank()]);
      if (!live) return;
      setEntries(all);
      setCount(total);
    })();

    return () => {
      live = false;
    };
  }, [version]);

  return { entries, count };
}
