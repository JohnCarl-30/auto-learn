import type {
  GatedSuggestionType,
  PartOfSpeech,
  Register,
  TransformOption,
} from '@auto-learn/shared';

/**
 * A propose case.
 *
 * `why` is required. A dataset accumulates cases faster than anyone
 * remembers what they were for, and a case nobody can justify is the first
 * thing to get "fixed" by loosening the expectation it was written to hold.
 */
export interface ProposeCase {
  id: string;
  text: string;
  option: TransformOption;
  /** Substrings that must be corrected silently — mechanical, never gated. */
  expectSilent?: string[];
  /**
   * Substrings that must be gated, at one of the types named.
   *
   * A list rather than a single type because some edits are defensibly two
   * things — "kind of" is informal *and* imprecise — and an eval that insists
   * on one label fails on a judgement call rather than on a regression.
   */
  expectGated?: Array<{
    original: string;
    type: GatedSuggestionType | GatedSuggestionType[];
  }>;
  /** Already correct under this transform: any edit at all is a false positive. */
  clean?: boolean;
  why: string;
}

export interface CardCase {
  id: string;
  /** The headword the card is about. Must exist in the dictionary fixtures. */
  word: string;
  sentence: string;
  /** The in-context reason /propose would have passed through. Null for a lookup. */
  reason: string | null;
  expectRegister?: Register;
  expectPartOfSpeech?: PartOfSpeech;
  /**
   * Words that give away a wrong sense.
   *
   * This is the polysemy check, and it is the highest-value assertion in the
   * card suite: "novel" defined as a long work of fiction is fluent, confident
   * and teaches a learner the wrong word.
   */
  forbidInDefinition?: string[];
  why: string;
}
