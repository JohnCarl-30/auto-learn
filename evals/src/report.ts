import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatSpend } from './cost';
import { totalSpend } from './runner';
import type { Baseline, SuiteRun } from './types';

const RESULTS_DIR = fileURLToPath(new URL('../results/', import.meta.url));
const RUNS_DIR = `${RESULTS_DIR}runs/`;
export const BASELINE_PATH = `${RESULTS_DIR}baseline.json`;

const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code: string, value: string) =>
  useColor ? `\x1b[${code}m${value}\x1b[0m` : value;
const red = (s: string) => paint('31', s);
const green = (s: string) => paint('32', s);
const dim = (s: string) => paint('2', s);

export interface ScorerSummary {
  scorer: string;
  /** Runs where the scorer applied. Cases it skipped are not counted as passes. */
  applicable: number;
  passed: number;
  passRate: number;
  mean: number;
}

export function summarize(run: SuiteRun): ScorerSummary[] {
  const buckets = new Map<string, { passed: number; scores: number[] }>();

  for (const caseRun of run.runs) {
    for (const score of caseRun.scores) {
      const bucket = buckets.get(score.scorer) ?? { passed: 0, scores: [] };
      bucket.scores.push(score.score);
      if (score.passed) bucket.passed += 1;
      buckets.set(score.scorer, bucket);
    }
  }

  return [...buckets.entries()].map(([scorer, { passed, scores }]) => ({
    scorer,
    applicable: scores.length,
    passed,
    passRate: passed / scores.length,
    mean: scores.reduce((a, b) => a + b, 0) / scores.length,
  }));
}

export interface Regression {
  suite: string;
  scorer: string;
  was: number;
  now: number;
  /** Sample counts behind each rate, so a thin baseline is visible in the failure. */
  wasSamples: number;
  nowSamples: number;
}

export function printReport(
  run: SuiteRun,
  baseline: Baseline | null,
  tolerance: number,
): Regression[] {
  const summaries = summarize(run);
  const previous = baseline?.[run.suite]?.scorers;
  const cases = new Set(run.runs.map((r) => r.caseId)).size;
  const regressions: Regression[] = [];

  const heading = `${run.suite} · ${run.model} · ${cases} cases x ${run.repeat}${run.judged ? '' : ' · judge off'}`;
  process.stdout.write(`\n${heading}\n${dim('-'.repeat(heading.length))}\n`);

  const width = Math.max(...summaries.map((s) => s.scorer.length), 20);
  for (const summary of summaries.sort((a, b) => a.passRate - b.passRate)) {
    const before = previous?.[summary.scorer];
    let delta = dim('  new');

    if (before) {
      const change = summary.passRate - before.passRate;
      const shown = `${change >= 0 ? '+' : ''}${change.toFixed(2)}`;
      if (change < -tolerance) {
        regressions.push({
          suite: run.suite,
          scorer: summary.scorer,
          was: before.passRate,
          now: summary.passRate,
          wasSamples: before.samples ?? 0,
          nowSamples: summary.applicable,
        });
        delta = red(shown);
      } else {
        delta = change === 0 ? dim('    =') : green(shown);
      }
    }

    const tally = `${summary.passed}/${summary.applicable}`;
    const mark = summary.passed === summary.applicable ? green('ok') : red('XX');
    process.stdout.write(
      `  ${mark} ${summary.scorer.padEnd(width)}  ${tally.padStart(7)}   mean ${summary.mean.toFixed(2)}   ${delta}\n`,
    );
  }

  // Failures, with the detail the scorer produced. A pass rate tells you that
  // something moved; this is the part that tells you what to go and read.
  const failures = run.runs.flatMap((caseRun) =>
    caseRun.scores
      .filter((score) => !score.passed)
      .map((score) => ({ caseRun, score })),
  );

  if (failures.length > 0) {
    process.stdout.write('\n');
    for (const { caseRun, score } of failures) {
      const attempt = run.repeat > 1 ? dim(` #${caseRun.attempt}`) : '';
      process.stdout.write(
        `  ${red('XX')} ${caseRun.caseId}${attempt} · ${score.scorer}: ${score.detail ?? 'failed'}\n`,
      );
    }
  }

  process.stdout.write(`\n  ${dim(formatSpend(totalSpend(run)))}\n`);
  return regressions;
}

export function writeRunFile(run: SuiteRun): string {
  mkdirSync(RUNS_DIR, { recursive: true });
  const path = `${RUNS_DIR}${run.suite}-${run.ranAt.replace(/[:.]/g, '-')}.json`;
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`);
  return path;
}

/**
 * The newest run file for a suite.
 *
 * Exists so that liking a run's numbers does not cost a second run to record
 * them. `--update-baseline` on its own re-runs, which is what CI wants;
 * `--update-baseline --from-last` records the run you just read.
 */
export function loadLastRun(suite: string): SuiteRun | null {
  if (!existsSync(RUNS_DIR)) return null;

  // ISO timestamps in the filename sort chronologically as strings.
  const latest = readdirSync(RUNS_DIR)
    .filter((name) => name.startsWith(`${suite}-`) && name.endsWith('.json'))
    .sort()
    .pop();

  if (!latest) return null;
  return JSON.parse(readFileSync(`${RUNS_DIR}${latest}`, 'utf8')) as SuiteRun;
}

export function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
}

/**
 * Rewrites only the suites that just ran, so `pnpm eval propose
 * --update-baseline` cannot silently blank the card numbers.
 */
export function updateBaseline(runs: SuiteRun[]): void {
  const baseline = loadBaseline() ?? {};

  for (const run of runs) {
    baseline[run.suite] = {
      recordedAt: run.ranAt,
      model: run.model,
      cases: new Set(run.runs.map((r) => r.caseId)).size,
      repeat: run.repeat,
      scorers: Object.fromEntries(
        summarize(run).map((s) => [
          s.scorer,
          {
            passRate: Number(s.passRate.toFixed(4)),
            mean: Number(s.mean.toFixed(4)),
            samples: s.applicable,
          },
        ]),
      ),
    };
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}
