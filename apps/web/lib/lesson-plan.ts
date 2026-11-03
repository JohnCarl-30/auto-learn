import {
  UNITS,
  maskLemma,
  type BankEntry,
  type LessonProgress,
  type LessonUnit,
  type UnitId,
} from '@auto-learn/shared';

/**
 * The pure decisions a lesson makes when it opens: which unit, and what each
 * due word is recalled from. Kept apart from `useLesson` so they are tested
 * directly, without a hook or a mocked bank.
 */

/** One bank word to recall, and the hint it is recalled from. */
export interface ReviewItem {
  entryId: string;
  lemma: string;
  cue: string;
  /** True when the cue is the definition, because there was no sentence to blank. */
  cueIsDefinition: boolean;
}

/**
 * The due words as review items, in the server's order (most overdue first).
 *
 * The learner's own sentence, with the word blanked, is the better cue: it is
 * the memory hook the bank keeps the sentence for. A synced entry arrives with
 * no sentence (they stay on the device that wrote them), and a sentence the
 * mask leaves unchanged would give the answer away, so both fall back to the
 * definition. Ids with no local entry are dropped: there is nothing to show.
 */
export function reviewItems(entries: BankEntry[], dueIds: string[]): ReviewItem[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return dueIds.flatMap((id) => {
    const entry = byId.get(id);
    if (!entry) return [];
    const sentence = entry.sourceSentence.trim();
    const masked = maskLemma(sentence, entry.lemma);
    const useSentence = sentence !== '' && masked !== sentence;
    return [
      {
        entryId: id,
        lemma: entry.lemma,
        cue: useSentence ? masked : entry.definition,
        cueIsDefinition: !useSentence,
      },
    ];
  });
}

/**
 * The requested unit if it is open; a random one once the path is done, so
 * practice keeps varying; otherwise the newest one open.
 */
export function chooseUnit(progress: LessonProgress, unitId?: UnitId): LessonUnit {
  if (unitId && unitId <= progress.highestUnlocked) return UNITS[unitId - 1];
  if (progress.pathFinished) {
    return UNITS[Math.floor(Math.random() * UNITS.length)];
  }
  return UNITS[progress.highestUnlocked - 1];
}
