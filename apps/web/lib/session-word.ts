import type { BankEntry } from '@auto-learn/shared';

/** A word used within the last day is fresh enough; practise something else. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * The word offered at the top of a conversation.
 *
 * `banked` says where it came from: the bank, or a suggestion that joins the
 * bank only once the learner actually uses it. `justBanked` marks the second
 * case after it has happened, so the panel can say so without claiming a word
 * from the bank was "added".
 */
export type PracticeWord = {
  word: string;
  lemma: string;
  definition: string;
  banked: boolean;
  used: boolean;
  justBanked?: boolean;
};

/**
 * The banked word most in need of practice, or null when none is due.
 *
 * Never-reused words first — a word learned and never said again is the one
 * most likely to be lost — oldest first, then the one reused longest ago.
 */
export function pickBankWord(entries: BankEntry[], now: Date): BankEntry | null {
  const cutoff = now.getTime() - STALE_AFTER_MS;
  const due = entries.filter(
    (entry) =>
      entry.lastReusedAt === null || Date.parse(entry.lastReusedAt) < cutoff,
  );

  // ISO strings sort as dates, and '' (never reused) sorts before any of them.
  due.sort(
    (a, b) =>
      (a.lastReusedAt ?? '').localeCompare(b.lastReusedAt ?? '') ||
      a.addedAt.localeCompare(b.addedAt),
  );
  return due[0] ?? null;
}
