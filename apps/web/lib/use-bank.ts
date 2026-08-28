'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { BankEntry } from '@auto-learn/shared';
import { countBank, exportBank, listBank, removeWord, restoreWord } from './bank';
import { datedFilename, downloadJson } from './download';

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
  /** Bumped by this hook's own mutations, so a delete re-reads immediately. */
  const [ownVersion, setOwnVersion] = useState(0);

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
  }, [version, ownVersion]);

  /**
   * Removing is the one destructive act in the product, and the bank row simply
   * vanished — no confirmation, nothing to reach for if it was the wrong row.
   * The undo lives here rather than at the call site so it cannot drift from
   * the delete it reverses.
   */
  const remove = useCallback(
    async (id: string) => {
      const entry = entries.find((candidate) => candidate.id === id);

      await removeWord(id);
      setOwnVersion((v) => v + 1);

      if (!entry) return;

      toast(`Removed ${entry.word}`, {
        action: {
          label: 'Undo',
          onClick: () => {
            void restoreWord(entry).then(() => setOwnVersion((v) => v + 1));
          },
        },
      });
    },
    [entries],
  );

  /**
   * Writes the bank to a file the reader keeps.
   *
   * The bank lives in one browser and nowhere else until accounts exist, so
   * this is the only thing standing between a cleared cache and losing every
   * word the product taught someone.
   */
  const download = useCallback(async () => {
    const data = await exportBank();

    downloadJson(datedFilename('auto-learn-bank', new Date()), data);
    toast.success(
      `Saved ${data.entries.length} ${data.entries.length === 1 ? 'word' : 'words'} to a file`,
    );
  }, []);

  return { entries, count, remove, download };
}
