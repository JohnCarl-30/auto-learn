import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cardScorers } from './scorers/card';
import { proposeScorers } from './scorers/propose';
import { cardSuite } from './suites/card';
import { proposeSuite } from './suites/propose';
import {
  loadBaseline,
  loadLastRun,
  printReport,
  updateBaseline,
  writeRunFile,
} from './report';
import { runSuite, type Suite } from './runner';
import { JUDGE_MODEL } from './judge';
import type { SuiteRun } from './types';

const USAGE = `pnpm eval [propose|card] [options]

  --repeat=N           run every case N times; the spread is the flakiness (default 1)
  --concurrency=N      cases in flight at once (default 4)
  --no-judge           deterministic scorers only: no judge calls, no judge cost
  --filter=TEXT        only cases whose id contains TEXT
  --limit=N            only the first N cases, after filtering
  --tolerance=N        pass-rate drop tolerated against the baseline (default 0.05)
  --update-baseline    record this run as the new baseline instead of comparing
  --from-last          with --update-baseline: record the last run on disk, call nothing
  --list               print the cases and scorers, call nothing, spend nothing

Exits non-zero when a scorer's pass rate falls more than --tolerance below the
baseline in results/baseline.json. With no baseline it reports and exits 0.`;

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=', 2);
      flags.set(key!, value ?? 'true');
    } else {
      positional.push(arg);
    }
  }

  const number = (key: string, fallback: number) => {
    const raw = flags.get(key);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw new Error(`--${key} needs a number`);
    return parsed;
  };

  return {
    suites: positional,
    help: flags.has('help'),
    list: flags.has('list'),
    judge: !flags.has('no-judge'),
    repeat: number('repeat', 1),
    concurrency: number('concurrency', 4),
    tolerance: number('tolerance', 0.05),
    limit: flags.has('limit') ? number('limit', 0) : undefined,
    filter: flags.get('filter'),
    updateBaseline: flags.has('update-baseline'),
    fromLast: flags.has('from-last'),
  };
}

/**
 * The API's `.env` is the one that already holds this key, and asking someone
 * to keep a second copy in sync is asking for an eval run against a key that
 * expired six weeks ago.
 */
function loadApiEnv(): void {
  if (process.env.OPENAI_API_KEY) return;

  const path = fileURLToPath(new URL('../../apps/api/.env', import.meta.url));
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (key && !process.env[key]) {
      process.env[key] = raw!.trim().replace(/^["']|["']$/g, '');
    }
  }
}

function printList(): void {
  for (const [suite, scorers, cases] of [
    ['propose', proposeScorers, proposeSuite.cases.map((c) => c.id)],
    ['card', cardScorers, cardSuite.cases.map((c) => c.id)],
  ] as const) {
    process.stdout.write(`\n${suite}\n`);
    process.stdout.write('  scorers\n');
    for (const scorer of scorers) {
      process.stdout.write(`    ${scorer.name.padEnd(24)} ${scorer.describe}\n`);
    }
    process.stdout.write(`  cases (${cases.length})\n`);
    for (const id of cases) process.stdout.write(`    ${id}\n`);
  }
  process.stdout.write(`\njudge model: ${JUDGE_MODEL}\n`);
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  if (options.list) {
    printList();
    return 0;
  }

  const wanted = options.suites.length > 0 ? options.suites : ['propose', 'card'];
  const unknown = wanted.filter((name) => name !== 'propose' && name !== 'card');
  if (unknown.length > 0) {
    process.stderr.write(`Unknown suite: ${unknown.join(', ')}\n\n${USAGE}\n`);
    return 2;
  }

  if (options.fromLast) {
    if (!options.updateBaseline) {
      process.stderr.write('--from-last only means anything with --update-baseline\n');
      return 2;
    }

    const recorded = wanted.map((name) => {
      const run = loadLastRun(name);
      if (!run) throw new Error(`No run on disk for "${name}". Run the suite first.`);
      return run;
    });

    for (const run of recorded) printReport(run, null, options.tolerance);
    updateBaseline(recorded);
    process.stdout.write('\nBaseline updated from the runs already on disk.\n');
    return 0;
  }

  loadApiEnv();
  if (!process.env.OPENAI_API_KEY) {
    process.stderr.write(
      'OPENAI_API_KEY is not set, and apps/api/.env did not supply one.\n' +
        'These evals call a real model on purpose — a mocked eval measures the mock.\n',
    );
    return 2;
  }

  const runs: SuiteRun[] = [];

  // Suites run one after another so the progress output stays readable and the
  // two models' rate limits are not competing. Concurrency lives inside a suite.
  for (const name of wanted) {
    const suite = (name === 'propose' ? proposeSuite : cardSuite) as Suite<unknown>;
    process.stderr.write(`\nrunning ${name}...\n`);

    const run = await runSuite(suite, {
      repeat: options.repeat,
      concurrency: options.concurrency,
      judge: options.judge,
      filter: options.filter,
      limit: options.limit,
      onProgress(done, total, caseRun) {
        const failed = caseRun.scores.filter((s) => !s.passed).length;
        const status = caseRun.error
          ? 'ERROR'
          : failed > 0
            ? `${failed} failed`
            : 'ok';
        process.stderr.write(
          `  [${done}/${total}] ${caseRun.caseId} — ${status} (${caseRun.ms}ms)\n`,
        );
      },
    });

    runs.push(run);
  }

  if (options.updateBaseline) {
    for (const run of runs) printReport(run, null, options.tolerance);
    updateBaseline(runs);
    process.stdout.write('\nBaseline updated. Commit it with the change that moved it.\n');
    return 0;
  }

  const baseline = loadBaseline();
  const regressions = runs.flatMap((run) => {
    const found = printReport(run, baseline, options.tolerance);
    writeRunFile(run);
    return found;
  });

  if (!baseline) {
    process.stdout.write(
      '\nNo baseline yet. Once these numbers look right, record them:\n' +
        '  pnpm eval --update-baseline\n',
    );
    return 0;
  }

  if (regressions.length > 0) {
    process.stdout.write(
      '\nRegressions (check n before believing one — a rate measured once is an estimate):\n',
    );
    for (const r of regressions) {
      process.stdout.write(
        `  ${r.suite}/${r.scorer}: ${(r.was * 100).toFixed(0)}% (n=${r.wasSamples || '?'}) -> ${(r.now * 100).toFixed(0)}% (n=${r.nowSamples})\n`,
      );
    }
    return 1;
  }

  process.stdout.write('\nNo regressions against the baseline.\n');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exit(2);
  });
