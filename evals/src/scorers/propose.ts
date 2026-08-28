import { SILENT_TYPES, locateSpan } from '@auto-learn/shared';
import type { ModelEdit, ModelProposal } from '@auto-learn/shared';
import type { ProposeCase } from '../cases';
import { booleanScore, ratioScore, type Score, type Scorer } from '../types';

export interface ProposeSubject {
  testCase: ProposeCase;
  /** As `splitSentences` produced them — the same array the service numbered. */
  sentences: string[];
  proposal: ModelProposal;
}

/** Every edit the model returned, paired with the sentence it belongs to. */
interface PlacedEdit {
  edit: ModelEdit;
  sentence: string;
  /** The sentence after silent fixes, which is where production locates gated spans. */
  resolvedSentence: string;
}

const isSilent = (edit: ModelEdit) => SILENT_TYPES.has(edit.type);

/**
 * Mirrors `ProposeService.resolveSentence`: silent fixes land first, and gated
 * spans are then located in the resulting text.
 *
 * Deliberately a small reimplementation rather than an import — the service
 * method also mints ids, writes telemetry and touches the session store, none
 * of which a scorer should be dragging in. What is copied is eight lines of
 * string slicing, and `verbatim-spans` fails loudly if the two ever disagree.
 */
function applySilentFixes(sentence: string, edits: ModelEdit[]): string {
  let text = sentence;
  for (const edit of edits.filter(isSilent)) {
    const span = locateSpan(text, edit.original);
    if (!span) continue;
    text = text.slice(0, span.start) + edit.replacement + text.slice(span.end);
  }
  return text;
}

export function placeEdits(subject: ProposeSubject): PlacedEdit[] {
  return subject.proposal.sentences.flatMap((entry) => {
    const sentence = subject.sentences[entry.index];
    if (sentence === undefined) return [];
    const resolvedSentence = applySilentFixes(sentence, entry.edits);
    return entry.edits.map((edit) => ({ edit, sentence, resolvedSentence }));
  });
}

/** Sentences the model reported against an index that does not exist. */
function strayIndexes(subject: ProposeSubject): number[] {
  return subject.proposal.sentences
    .map((s) => s.index)
    .filter((index) => subject.sentences[index] === undefined);
}

const normalize = (value: string) =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

/** Either span containing the other counts — the model picks its own width. */
const overlaps = (a: string, b: string) => {
  // Raw first, so a whitespace-or-punctuation expectation like " ," survives —
  // normalising would collapse it to nothing and match everything.
  const [rawA, rawB] = [a.toLowerCase(), b.toLowerCase()];
  if (rawA.length > 0 && rawB.length > 0 && (rawA.includes(rawB) || rawB.includes(rawA))) {
    return true;
  }
  const [x, y] = [normalize(a), normalize(b)];
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
};

/** Strips everything but letters and digits: what is left is the real change. */
const alphanumeric = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

// --- Scorers ------------------------------------------------------------------

/**
 * The single most consequential invariant in the propose call.
 *
 * The service never trusts model offsets; it searches for `original` and drops
 * any edit it cannot find. A drop is silent by design — the user just sees
 * fewer suggestions than the model produced — so nothing in production will
 * ever tell you the model started paraphrasing the spans it quotes.
 */
const verbatimSpans: Scorer<ProposeSubject> = {
  name: 'verbatim-spans',
  describe: 'Every edit quotes its sentence exactly, so production can locate it',
  score(subject) {
    const placed = placeEdits(subject);
    const stray = strayIndexes(subject);
    if (placed.length === 0 && stray.length === 0) return null;

    const lost = placed.filter(({ edit, sentence, resolvedSentence }) => {
      const target = isSilent(edit) ? sentence : resolvedSentence;
      return !locateSpan(target, edit.original);
    });

    const total = placed.length + stray.length;
    const detail = [
      ...lost.map((p) => `unlocatable: ${JSON.stringify(p.edit.original)}`),
      ...stray.map((i) => `edits for sentence ${i}, which was not sent`),
    ].join('; ');

    return ratioScore('verbatim-spans', placed.length - lost.length, total, {
      detail,
    });
  },
};

/**
 * "Never remove content. Every claim the writer made must survive."
 *
 * Spacing and punctuation edits legitimately delete — a stray comma has no
 * replacement — so the rule is scoped to the types that carry meaning.
 */
const noDeletion: Scorer<ProposeSubject> = {
  name: 'no-deletion',
  describe: 'No meaning-bearing edit replaces the writer with nothing',
  score(subject) {
    const placed = placeEdits(subject).filter(
      ({ edit }) => edit.type !== 'spacing' && edit.type !== 'punctuation',
    );
    if (placed.length === 0) return null;

    const deletions = placed.filter(
      ({ edit }) => edit.replacement.trim().length === 0,
    );

    return ratioScore('no-deletion', placed.length - deletions.length, placed.length, {
      detail: deletions
        .map((p) => `deleted ${JSON.stringify(p.edit.original)}`)
        .join('; '),
    });
  },
};

/**
 * "Prefer the shortest span. Never rewrite a whole sentence as one edit."
 *
 * A whole-sentence span is not just untidy: the gate teaches one word, so an
 * edit spanning the sentence has nothing teachable to put on a card.
 */
const spanMinimality: Scorer<ProposeSubject> = {
  name: 'span-minimality',
  describe: 'No single edit swallows most of its sentence',
  score(subject) {
    const placed = placeEdits(subject);
    if (placed.length === 0) return null;

    const oversized = placed.filter(
      ({ edit, sentence }) =>
        edit.original.trim().length > sentence.trim().length * 0.7,
    );

    return ratioScore('span-minimality', placed.length - oversized.length, placed.length, {
      detail: oversized
        .map((p) => `covers the sentence: ${JSON.stringify(p.edit.original)}`)
        .join('; '),
    });
  },
};

/**
 * The case's own expectations: this substring must be fixed, at this tier.
 *
 * Tier is half the assertion. A typo gated behind a card wastes the gate on a
 * spelling slip; a weak word applied silently skips the teaching moment the
 * product exists for.
 */
const expectedFixes: Scorer<ProposeSubject> = {
  name: 'expected-fixes',
  describe: 'The edits the case was written to demand are present, at the right tier',
  score(subject) {
    const expectations = [
      ...(subject.testCase.expectSilent ?? []).map((original) => ({
        original,
        tier: 'silent' as const,
        type: null,
      })),
      ...(subject.testCase.expectGated ?? []).map((e) => ({
        original: e.original,
        tier: 'gated' as const,
        type: e.type,
      })),
    ];
    if (expectations.length === 0) return null;

    const placed = placeEdits(subject);
    const missed: string[] = [];

    for (const expected of expectations) {
      const hit = placed.some(({ edit }) => {
        if (!overlaps(edit.original, expected.original)) return false;
        if (expected.tier === 'silent') return isSilent(edit);
        const allowed = [expected.type ?? []].flat();
        return !isSilent(edit) && allowed.includes(edit.type as never);
      });
      if (!hit) {
        const wrongTier = placed.find(({ edit }) =>
          overlaps(edit.original, expected.original),
        );
        missed.push(
          wrongTier
            ? `${JSON.stringify(expected.original)} came back as "${wrongTier.edit.type}", wanted ${[expected.type ?? []].flat().join(' or ') || 'a silent fix'}`
            : `${JSON.stringify(expected.original)} was not touched`,
        );
      }
    }

    return ratioScore(
      'expected-fixes',
      expectations.length - missed.length,
      expectations.length,
      { detail: missed.join('; ') },
    );
  },
};

/**
 * "If a sentence needs nothing, return an empty edits array. Do not invent
 * changes to seem useful."
 *
 * The expensive failure mode. A learner who is corrected on correct writing
 * learns something false and stops trusting the corrections that matter.
 */
const noFalsePositives: Scorer<ProposeSubject> = {
  name: 'no-false-positives',
  describe: 'A sentence that needs nothing comes back untouched',
  score(subject) {
    if (!subject.testCase.clean) return null;

    const placed = placeEdits(subject);
    return booleanScore(
      'no-false-positives',
      placed.length === 0,
      placed
        .map((p) => `${p.edit.type}: ${JSON.stringify(p.edit.original)} → ${JSON.stringify(p.edit.replacement)}`)
        .join('; '),
    );
  },
};

/**
 * "Correct grammatical errors only. Do not restyle correct sentences."
 *
 * The transform the user picked is a promise about scope. Someone who asked
 * for grammar and got their vocabulary rewritten was not served.
 */
const grammarDiscipline: Scorer<ProposeSubject> = {
  name: 'transform-discipline',
  describe: 'The grammar transform stays out of word choice and register',
  score(subject) {
    if (subject.testCase.option !== 'grammar') return null;

    const placed = placeEdits(subject);
    if (placed.length === 0) return null;

    const strays = placed.filter(
      ({ edit }) => edit.type === 'word-choice' || edit.type === 'register',
    );

    return ratioScore('transform-discipline', placed.length - strays.length, placed.length, {
      detail: strays
        .map((p) => `${p.edit.type} under a grammar-only transform: ${JSON.stringify(p.edit.original)}`)
        .join('; '),
    });
  },
};

/**
 * A gate costs the reader a card. Spending one on a change that alters no
 * letters — a comma, a capital, a stray space — spends the mechanic's power on
 * nothing, and deposits a non-word in the word bank.
 */
const mechanicalNotGated: Scorer<ProposeSubject> = {
  name: 'mechanical-not-gated',
  describe: 'Punctuation and spacing never reach the gate',
  score(subject) {
    const gated = placeEdits(subject).filter(({ edit }) => !isSilent(edit));
    if (gated.length === 0) return null;

    const mechanical = gated.filter(
      ({ edit }) => alphanumeric(edit.original) === alphanumeric(edit.replacement),
    );

    return ratioScore('mechanical-not-gated', gated.length - mechanical.length, gated.length, {
      detail: mechanical
        .map((p) => `gated a ${p.edit.type} that changes no letters: ${JSON.stringify(p.edit.original)}`)
        .join('; '),
    });
  },
};

export const proposeScorers: Scorer<ProposeSubject>[] = [
  verbatimSpans,
  noDeletion,
  spanMinimality,
  expectedFixes,
  noFalsePositives,
  grammarDiscipline,
  mechanicalNotGated,
];

export function scorePropose(subject: ProposeSubject): Score[] {
  return proposeScorers
    .map((scorer) => scorer.score(subject))
    .filter((score): score is Score => score !== null);
}
