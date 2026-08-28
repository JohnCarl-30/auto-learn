import { emptySpend, sumSpend } from './cost';
import type { CaseRun, Score, Spend, SuiteRun } from './types';

export interface Suite<Case> {
  name: string;
  /** The model under test, for the report and the baseline. */
  model: string;
  cases: Case[];
  id(testCase: Case): string;
  /** Every scorer this suite can emit. A failed call scores zero on all of them. */
  scorerNames(options: { judge: boolean }): string[];
  run(
    testCase: Case,
    options: { judge: boolean },
  ): Promise<{ scores: Score[]; spend: Spend; output: unknown }>;
}

export interface RunOptions {
  repeat: number;
  concurrency: number;
  judge: boolean;
  filter?: string;
  limit?: number;
  onProgress?(done: number, total: number, run: CaseRun): void;
}

export async function runSuite<Case>(
  suite: Suite<Case>,
  options: RunOptions,
): Promise<SuiteRun> {
  let cases = suite.cases;
  if (options.filter) {
    const needle = options.filter.toLowerCase();
    cases = cases.filter((c) => suite.id(c).toLowerCase().includes(needle));
  }
  if (options.limit !== undefined) cases = cases.slice(0, options.limit);

  // Repeats are flattened into the work list rather than nested, so attempt 3
  // of an early case can run while a later case is still on attempt 1.
  const work = cases.flatMap((testCase) =>
    Array.from({ length: options.repeat }, (_, i) => ({
      testCase,
      attempt: i + 1,
    })),
  );

  let done = 0;
  const runs = await mapWithConcurrency(
    work,
    options.concurrency,
    async ({ testCase, attempt }): Promise<CaseRun> => {
      const caseId = suite.id(testCase);
      const started = Date.now();

      try {
        const { scores, spend, output } = await suite.run(testCase, {
          judge: options.judge,
        });
        const run: CaseRun = {
          caseId,
          attempt,
          scores,
          spend,
          ms: Date.now() - started,
          output,
        };
        options.onProgress?.(++done, work.length, run);
        return run;
      } catch (error) {
        // Not skipped, not retried. A call that fails is a product failure,
        // and a harness that quietly drops it reports a pass rate over the
        // subset that happened to work.
        const message = error instanceof Error ? error.message : String(error);
        const run: CaseRun = {
          caseId,
          attempt,
          scores: suite
            .scorerNames({ judge: options.judge })
            .map((scorer) => ({
              scorer,
              score: 0,
              passed: false,
              detail: `call failed: ${message}`,
            })),
          spend: emptySpend(),
          ms: Date.now() - started,
          error: message,
        };
        options.onProgress?.(++done, work.length, run);
        return run;
      }
    },
  );

  return {
    suite: suite.name,
    model: suite.model,
    ranAt: new Date().toISOString(),
    judged: options.judge,
    repeat: options.repeat,
    runs,
  };
}

export const totalSpend = (run: SuiteRun): Spend =>
  sumSpend(run.runs.map((r) => r.spend));

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    },
  );

  await Promise.all(workers);
  return results;
}
