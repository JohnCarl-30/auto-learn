import { PartOfSpeech } from '@auto-learn/shared';
import type { DictionarySense, ModelCard } from '@auto-learn/shared';
import type { CardCase } from '../cases';
import { booleanScore, ratioScore, type Score, type Scorer } from '../types';

/** A recorded dictionary retrieval — the same shape `DictionaryService` returns. */
export interface DictionaryEntry {
  word: string;
  senses: DictionarySense[];
  synonyms: string[];
}

export interface CardSubject {
  testCase: CardCase;
  entry: DictionaryEntry;
  card: ModelCard;
}

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Words too common to say anything about whether two definitions differ. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'to', 'with', 'something', 'someone',
]);

const contentWords = (value: string) =>
  new Set(normalize(value).split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w)));

/**
 * Loose stem, enough to match "substantial" against "substantially" without
 * pulling in a morphology library for a check this cheap.
 */
const stem = (word: string) =>
  word.toLowerCase().slice(0, Math.max(4, word.length - 3));

const usesWordForm = (text: string, word: string) =>
  normalize(text).includes(stem(word));

const chosenSense = (subject: CardSubject) =>
  subject.entry.senses.find((s) => s.senseId === subject.card.senseId);

// --- Scorers ------------------------------------------------------------------

/**
 * The grounding claim, and the only card scorer that mirrors a hard production
 * failure: `CardService` throws when the senseId was not on offer.
 *
 * Scored anyway, because the difference between "grounded" and "throws 502 in
 * front of a user" is one retry, and the rate is what tells you which.
 */
const senseGrounded: Scorer<CardSubject> = {
  name: 'sense-grounded',
  describe: 'The chosen senseId was one the dictionary actually supplied',
  score(subject) {
    const sense = chosenSense(subject);
    return booleanScore(
      'sense-grounded',
      Boolean(sense),
      `senseId ${JSON.stringify(subject.card.senseId)} was not among ${subject.entry.senses.map((s) => s.senseId).join(', ')}`,
    );
  },
};

/**
 * The card's part of speech has to agree with the sense it claims to be
 * paraphrasing. Disagreement means one of the two is decoration.
 */
const posMatchesSense: Scorer<CardSubject> = {
  name: 'pos-matches-sense',
  describe: 'The card’s part of speech agrees with the sense it selected',
  score(subject) {
    const sense = chosenSense(subject);
    if (!sense) return null;

    // The dictionary is free text here; only compare when it lands on a value
    // our own enum knows about.
    const parsed = PartOfSpeech.safeParse(sense.partOfSpeech.toLowerCase());
    if (!parsed.success) return null;

    return booleanScore(
      'pos-matches-sense',
      parsed.data === subject.card.partOfSpeech,
      `card says ${subject.card.partOfSpeech}, sense ${sense.senseId} is ${parsed.data}`,
    );
  },
};

/**
 * "Rewrite that sense as a definition a B2-level learner can read. Do not copy
 * the dictionary wording, which is often archaic."
 *
 * Free Dictionary returns Wiktionary prose — "substantial" comes back as
 * "Corporeal; material; firm." Passing that through is the failure this
 * catches, and it is invisible from the outside because it reads authoritative.
 */
const definitionRewritten: Scorer<CardSubject> = {
  name: 'definition-rewritten',
  describe: 'The definition is a paraphrase, not the dictionary string returned',
  score(subject) {
    const sense = chosenSense(subject);
    if (!sense) return null;

    const source = contentWords(sense.definition);
    if (source.size === 0) return null;

    const written = contentWords(subject.card.definition);
    const shared = [...source].filter((word) => written.has(word)).length;
    const overlap = shared / source.size;
    const identical = normalize(sense.definition) === normalize(subject.card.definition);

    return booleanScore(
      'definition-rewritten',
      !identical && overlap < 0.8,
      `${Math.round(overlap * 100)}% of the dictionary's content words survive: ${JSON.stringify(subject.card.definition)}`,
    );
  },
};

/**
 * Polysemy, checked by its tell.
 *
 * A card for "novel" in "a novel approach" that mentions books has selected a
 * real sense of a real word and taught the learner the wrong one. Nothing else
 * in the harness catches this: the schema is satisfied, the sense is grounded,
 * and the prose is fluent.
 */
const rightSenseForContext: Scorer<CardSubject> = {
  name: 'right-sense-for-context',
  describe: 'The definition avoids the wording that would give away a wrong sense',
  score(subject) {
    const forbidden = subject.testCase.forbidInDefinition ?? [];
    if (forbidden.length === 0) return null;

    const haystack = normalize(subject.card.definition);
    const hits = forbidden.filter((word) => haystack.includes(normalize(word)));

    return booleanScore(
      'right-sense-for-context',
      hits.length === 0,
      `definition reads as the wrong sense (${hits.join(', ')}): ${JSON.stringify(subject.card.definition)}`,
    );
  },
};

/**
 * "That difference is the whole point, so 'similar meaning' is a useless
 * answer."
 *
 * The nuance line is the only part of the card a dictionary would not have
 * given the learner. When it degrades to a restatement, the card is a
 * dictionary with extra steps.
 */
const nuanceIsSubstantive: Scorer<CardSubject> = {
  name: 'nuance-is-substantive',
  describe: 'Each synonym says how it differs, not that it is similar',
  score(subject) {
    const synonyms = subject.card.synonyms;
    if (synonyms.length === 0) return null;

    const empty = /^(very |quite )?(similar|the same|equivalent|a synonym|synonymous|close|alike)\b/i;
    const bad = synonyms.filter(({ nuance }) => {
      const words = nuance.trim().split(/\s+/).filter(Boolean);
      return (
        words.length < 3 ||
        empty.test(nuance.trim()) ||
        /same meaning|similar meaning|means the same/i.test(nuance)
      );
    });

    return ratioScore('nuance-is-substantive', synonyms.length - bad.length, synonyms.length, {
      detail: bad.map((s) => `${s.word}: ${JSON.stringify(s.nuance)}`).join('; '),
    });
  },
};

/** A synonym list containing the headword teaches nothing and looks broken. */
const synonymsAreDistinct: Scorer<CardSubject> = {
  name: 'synonyms-are-distinct',
  describe: 'Synonyms are neither the target word nor each other',
  score(subject) {
    const synonyms = subject.card.synonyms;
    if (synonyms.length === 0) return null;

    const seen = new Set<string>();
    const targets = new Set([
      normalize(subject.testCase.word),
      normalize(subject.entry.word),
    ]);

    const bad = synonyms.filter(({ word }) => {
      const key = normalize(word);
      const duplicate = seen.has(key);
      seen.add(key);
      return duplicate || targets.has(key);
    });

    return ratioScore('synonyms-are-distinct', synonyms.length - bad.length, synonyms.length, {
      detail: bad.map((s) => `repeats the word: ${s.word}`).join('; '),
    });
  },
};

/**
 * "Give exactly 2 example sentences showing the word in academic writing. Do
 * not reuse the user's sentence."
 *
 * An example that hands the writer their own sentence back demonstrates
 * nothing, and one that never uses the word demonstrates it less.
 */
const examplesAreFresh: Scorer<CardSubject> = {
  name: 'examples-are-fresh',
  describe: 'Both examples use the word and neither echoes the writer’s sentence',
  score(subject) {
    const examples = subject.card.useCases;
    if (examples.length === 0) return null;

    const own = normalize(subject.testCase.sentence);
    const problems: string[] = [];

    for (const example of examples) {
      const text = normalize(example);
      if (text === own || text.includes(own) || own.includes(text)) {
        problems.push(`echoes the writer: ${JSON.stringify(example)}`);
      } else if (!usesWordForm(example, subject.testCase.word)) {
        problems.push(`never uses "${subject.testCase.word}": ${JSON.stringify(example)}`);
      }
    }

    return ratioScore('examples-are-fresh', examples.length - problems.length, examples.length, {
      detail: problems.join('; '),
    });
  },
};

/** Register drives whether the word belongs in an essay at all. */
const registerLabel: Scorer<CardSubject> = {
  name: 'register-label',
  describe: 'The register matches what the case expects',
  score(subject) {
    const expected = subject.testCase.expectRegister;
    if (!expected) return null;

    return booleanScore(
      'register-label',
      subject.card.register === expected,
      `labelled ${subject.card.register}, expected ${expected}`,
    );
  },
};

const partOfSpeechLabel: Scorer<CardSubject> = {
  name: 'part-of-speech',
  describe: 'The part of speech matches what the case expects',
  score(subject) {
    const expected = subject.testCase.expectPartOfSpeech;
    if (!expected) return null;

    return booleanScore(
      'part-of-speech',
      subject.card.partOfSpeech === expected,
      `labelled ${subject.card.partOfSpeech}, expected ${expected}`,
    );
  },
};

export const cardScorers: Scorer<CardSubject>[] = [
  senseGrounded,
  posMatchesSense,
  definitionRewritten,
  rightSenseForContext,
  nuanceIsSubstantive,
  synonymsAreDistinct,
  examplesAreFresh,
  registerLabel,
  partOfSpeechLabel,
];

export function scoreCard(subject: CardSubject): Score[] {
  return cardScorers
    .map((scorer) => scorer.score(subject))
    .filter((score): score is Score => score !== null);
}
