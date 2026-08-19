'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BankEntry } from '@auto-learn/shared';
import { countBank, listBank } from './bank';

export function useBank(version: number) {
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    // IndexedDB does not exist during SSR; the effect only runs client-side,
    // but guard anyway so this stays safe to call from anywhere.
    if (typeof indexedDB === 'undefined') return;
    const [all, total] = await Promise.all([listBank(), countBank()]);
    setEntries(all);
    setCount(total);
  }, []);

  // `version` is bumped by the review hook after every write, which is what
  // makes the bank visibly grow as you work.
  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  return { entries, count, refresh };
}
