'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { BankEntry } from '@auto-learn/shared';
import { BankExport } from '@auto-learn/shared';
import {
  countBank,
  exportBank,
  importBank,
  listBank,
  removeWord,
  restoreWord,
} from './bank';
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

  /**
   * Reads a previously exported file back in.
   *
   * Validated against the same schema that wrote it, at the boundary, before
   * anything touches IndexedDB — the file has been outside our control, and a
   * half-applied import is worse than a refused one. A file from a version this
   * build does not know is refused rather than guessed at.
   */
  const restore = useCallback(async (file: File) => {
    let parsed;

    try {
      parsed = BankExport.safeParse(JSON.parse(await file.text()));
    } catch {
      toast.error('That file is not readable as JSON.');
      return;
    }

    if (!parsed.success) {
      toast.error('That does not look like a word bank export.');
      return;
    }

    const { added, merged } = await importBank(parsed.data);
    setOwnVersion((v) => v + 1);

    toast.success(
      merged > 0
        ? `Restored ${added} ${added === 1 ? 'word' : 'words'}, and updated ${merged} you already had`
        : `Restored ${added} ${added === 1 ? 'word' : 'words'}`,
    );
  }, []);

  return { entries, count, remove, download, restore };
}
