import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ModelCard } from '@auto-learn/shared';
import { agreement, describeKappa, type Pair } from './agreement';
import { loadLastRun } from './report';
import type { CardVerdict } from './suites/card';
import type { z } from 'zod';

/**
 * Checks the judge.
 *
 * A judged score is a measurement, and an unvalidated measurement is a number
 * with no error bar. `judge-synonym-nuance` sitting at 67% means either the
 * card call is listing bad synonyms or the rubric is too strict, and nothing
 * in the harness can tell those apart — only a human can.
 *
 *   pnpm --filter @auto-learn/evals validate-judge            # build the sheet
 *   ...label `human` in labels/synonyms.json ("ok" | "bad"...
 *   pnpm --filter @auto-learn/evals validate-judge --report   # score the judge
 *
 * Existing labels survive re-extraction: a card that came back identical keeps
 * the label it already had, so labelling is cumulative rather than a chore
 * repeated after every run.
 */
const LABELS_PATH = fileURLToPath(new URL('../labels/synonyms.json', import.meta.url));

type Human = 'ok' | 'bad' | null;

interface LabelItem {
  /** Stable across runs: same card, same synonym, same label. */
  key: string;
  caseId: string;
  word: string;
  sentence: string;
  synonym: string;
  nuance: string;
  judge: { isSubstitutable: boolean; nuanceIsTrue: boolean; why: string };
  /**
   * Yours. "ok" if this word could stand in for the target in that sentence
   * and the nuance line is true; "bad" otherwise. Leave null to skip it —
   * unlabelled items are excluded rather than assumed.
   */
  human: Human;
  note?: string;
}

interface CardOutput {
  card: ModelCard;
  /** The target word. `ModelCard` has none — the service fills it in. */
  word: string;
  sentence: string;
  verdict: z.infer<typeof CardVerdict> | null;
}

const normalize = (value: string) => value.toLowerCase().trim();

function extract(): LabelItem[] {
  const run = loadLastRun('card');
  if (!run) {
    throw new Error('No card run on disk. Run: pnpm eval card');
  }

  const items: LabelItem[] = [];

  for (const caseRun of run.runs) {
    const output = caseRun.output as CardOutput | undefined;
    if (!output?.verdict) continue;

    for (const synonym of output.card.synonyms) {
      // Matched by word, not by position: the judge is told to keep the order
      // but a harness that trusts that silently mislabels when it does not.
      const judged = output.verdict.synonyms.find(
        (s) => normalize(s.word) === normalize(synonym.word),
      );
      if (!judged) continue;

      items.push({
        key: `${caseRun.caseId}#${normalize(synonym.word)}`,
        caseId: caseRun.caseId,
        word: output.word,
        sentence: output.sentence,
        synonym: synonym.word,
        nuance: synonym.nuance,
        judge: {
          isSubstitutable: judged.isSubstitutable,
          nuanceIsTrue: judged.nuanceIsTrue,
          why: judged.why,
        },
        human: null,
      });
    }
  }

  return items;
}

function load(): LabelItem[] {
  if (!existsSync(LABELS_PATH)) return [];
  return JSON.parse(readFileSync(LABELS_PATH, 'utf8')) as LabelItem[];
}

function build(): void {
  const existing = new Map(load().map((item) => [item.key, item]));
  const fresh = extract();

  const merged = fresh.map((item) => {
    const previous = existing.get(item.key);
    // The label is the human's, the rest is the run's. Keeping the old verdict
    // text here would quietly show yesterday's judge next to today's score.
    return previous
      ? { ...item, human: previous.human, ...(previous.note ? { note: previous.note } : {}) }
      : item;
  });

  // Items no longer produced by the latest run are kept, not dropped: the
  // labelling is the expensive part and the same card often comes back.
  for (const [key, item] of existing) {
    if (!merged.some((m) => m.key === key)) merged.push(item);
  }

  mkdirSync(fileURLToPath(new URL('../labels/', import.meta.url)), { recursive: true });
  writeFileSync(LABELS_PATH, `${JSON.stringify(merged, null, 2)}\n`);

  const unlabelled = merged.filter((item) => item.human === null).length;
  process.stdout.write(
    `${merged.length} items in ${LABELS_PATH}\n` +
      `${merged.length - unlabelled} labelled, ${unlabelled} to go.\n\n` +
      'Set "human" to "ok" or "bad" on each, then:\n' +
      '  pnpm --filter @auto-learn/evals validate-judge --report\n',
  );
}

function report(): number {
  const items = load();
  const labelled = items.filter((item) => item.human !== null);

  if (labelled.length === 0) {
    process.stderr.write(
      `Nothing labelled yet in ${LABELS_PATH}. Set "human" on some items first.\n`,
    );
    return 2;
  }

  const judged = (item: LabelItem) =>
    item.judge.isSubstitutable && item.judge.nuanceIsTrue;

  const pairs: Pair[] = labelled.map((item) => ({
    judge: judged(item),
    human: item.human === 'ok',
  }));

  const result = agreement(pairs);

  process.stdout.write(
    `\njudge-synonym-nuance vs ${labelled.length} human labels\n` +
      `${'-'.repeat(46)}\n` +
      `  raw agreement   ${(result.rawAgreement * 100).toFixed(0)}%\n` +
      `  kappa           ${result.kappa.toFixed(2)} (${describeKappa(result.kappa)})\n` +
      `  judge accepts   ${(result.judgeOkRate * 100).toFixed(0)}%\n` +
      `  you accept      ${(result.humanOkRate * 100).toFixed(0)}%\n` +
      `  too strict      ${result.judgeStricter} (judge rejected, you accepted)\n` +
      `  too loose       ${result.judgeLooser} (judge accepted, you rejected)\n`,
  );

  const disagreements = labelled.filter((item) => judged(item) !== (item.human === 'ok'));
  if (disagreements.length > 0) {
    process.stdout.write('\nDisagreements\n');
    for (const item of disagreements) {
      const direction = judged(item) ? 'judge ok, you bad' : 'judge bad, you ok';
      process.stdout.write(
        `  ${item.caseId} · "${item.synonym}" for "${item.word}" — ${direction}\n` +
          `      judge: ${item.judge.why}\n` +
          (item.note ? `      you:   ${item.note}\n` : ''),
      );
    }
  }

  // The verdict on the verdicts. Which side to fix is the whole question, and
  // the counts above answer it: strictness skewed one way is a rubric problem,
  // scattered disagreement is a rubric that is vague rather than wrong.
  process.stdout.write(
    result.judgeStricter > result.judgeLooser
      ? '\nThe judge rejects more than you do. Loosen the rubric before touching the card prompt.\n'
      : result.judgeLooser > result.judgeStricter
        ? '\nThe judge accepts things you would not. It is missing real defects — tighten the rubric.\n'
        : '\nErrors fall both ways: the rubric is vague rather than mis-aimed.\n',
  );

  return 0;
}

const mode = process.argv.slice(2);
try {
  process.exit(mode.includes('--report') ? report() : (build(), 0));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(2);
}
