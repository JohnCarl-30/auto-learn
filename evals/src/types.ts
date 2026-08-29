/**
 * One scorer's verdict on one model output.
 *
 * `score` is always 0..1 so that scorers of different shapes — "how many of
 * the model's edits survived" and "was the register label right" — average
 * into the same table. `passed` is the thresholded version, and it is what the
 * baseline comparison tracks: a mean that drifts from 0.94 to 0.91 is noise,
 * a pass rate that drops from 14/14 to 11/14 is a regression.
 */
export interface Score {
  scorer: string;
  score: number;
  passed: boolean;
  /** Shown under the case when it fails. Say what was wrong, not that it was. */
  detail?: string;
}

export interface Scorer<Subject> {
  name: string;
  /** One line, printed by `--list`. What would a failure here mean? */
  describe: string;
  /** Score at or above this passes. Defaults to 1 — most of these are invariants. */
  threshold?: number;
  /**
   * Return `null` when the scorer does not apply to this case — a
   * false-positive check has nothing to say about a sentence that was
   * supposed to need edits. Not-applicable runs are excluded from the
   * aggregate rather than counted as passes, which would let a dataset
   * inflate its own pass rate just by growing.
   */
  score(subject: Subject): Score | null;
}

/** Tokens and money for one model call, or a whole run once summed. */
export interface Spend {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** Null when the model is not in the price table — reported as unknown, never as zero. */
  usd: number | null;
  calls: number;
}

export interface CaseRun {
  caseId: string;
  /** 1-based. Above 1 only when `--repeat` is asking how stable the output is. */
  attempt: number;
  scores: Score[];
  spend: Spend;
  ms: number;
  /** Set when the call itself failed. Scored as zero, never skipped. */
  error?: string;
  output?: unknown;
}

export interface SuiteRun {
  suite: string;
  model: string;
  ranAt: string;
  judged: boolean;
  repeat: number;
  runs: CaseRun[];
}

/** What lands in `results/baseline.json`, per suite, per scorer. */
export interface Baseline {
  [suite: string]: {
    recordedAt: string;
    model: string;
    cases: number;
    /** Runs per case when this was recorded. */
    repeat: number;
    scorers: Record<
      string,
      {
        passRate: number;
        mean: number;
        /**
         * How many runs the rate is over.
         *
         * Recorded because a pass rate is an estimate, and comparing a
         * 33-sample run against an 11-sample baseline reads as a 6-point
         * regression when it may only be the baseline having been measured
         * once. Without this the two numbers look equally solid.
         */
        samples: number;
      }
    >;
  };
}

/**
 * Builds a Score from a ratio, with the threshold applied. Scorers return
 * "3 of 4 edits were locatable" and this decides whether that passed.
 */
export function ratioScore(
  scorer: string,
  passing: number,
  total: number,
  options: { threshold?: number; detail?: string } = {},
): Score {
  // A case with nothing to check is not a failure. An empty `expectGated`
  // means the case was written to exercise a different scorer.
  const score = total === 0 ? 1 : passing / total;
  const threshold = options.threshold ?? 1;
  return {
    scorer,
    score,
    passed: score >= threshold,
    detail: score >= threshold ? undefined : options.detail,
  };
}

export function booleanScore(
  scorer: string,
  ok: boolean,
  detail?: string,
): Score {
  return { scorer, score: ok ? 1 : 0, passed: ok, detail: ok ? undefined : detail };
}
