import { z } from 'zod';
import { ApiError } from './errors';
import { Pronunciation } from './speech';

export const PartOfSpeech = z.enum([
  'noun',
  'verb',
  'adjective',
  'adverb',
  'preposition',
  'conjunction',
  'pronoun',
  'determiner',
  'interjection',
  'other',
]);
export type PartOfSpeech = z.infer<typeof PartOfSpeech>;

export const Register = z.enum(['formal', 'neutral', 'informal']);
export type Register = z.infer<typeof Register>;

export const SynonymNuance = z.object({
  word: z.string(),
  /** How this differs from the headword — the part a dictionary won't tell you. */
  nuance: z.string(),
});
export type SynonymNuance = z.infer<typeof SynonymNuance>;

export const WordCard = z.object({
  word: z.string(),
  lemma: z.string(),
  partOfSpeech: PartOfSpeech,
  /** The retrieved sense, paraphrased for a learner — not the raw dictionary string. */
  definition: z.string(),
  /** Which retrieved sense was selected. Traceability for the grounding claim. */
  senseId: z.string(),
  synonyms: z.array(SynonymNuance).min(2).max(3),
  useCases: z.array(z.string()).length(2),
  register: Register,
  /**
   * One line. Not a panel — people read edit rationale twice and never again.
   * Null for a plain lookup, where no change was proposed to justify.
   */
  whyHere: z.string().nullable(),
  /** How it sounds. Retrieved with the senses, not generated — see ModelCard. */
  pronunciation: Pronunciation,
});
export type WordCard = z.infer<typeof WordCard>;

export const CardRequest = z.discriminatedUnion('kind', [
  /** Opening the gate on a tier-2 suggestion. */
  z.object({
    kind: z.literal('suggestion'),
    sessionId: z.string(),
    suggestionId: z.string(),
  }),
  /** Tapping any other word out of curiosity. */
  z.object({
    kind: z.literal('lookup'),
    sessionId: z.string(),
    sentenceIndex: z.number().int(),
    word: z.string(),
  }),
]);
export type CardRequest = z.infer<typeof CardRequest>;

/**
 * What a grammar gate returns instead of a card.
 *
 * A word card defining "shows" teaches nothing about subject-verb agreement —
 * the lesson is the rule, not the word. Grammar still passes through the gate
 * (you read before you accept) but gets a single line, and deposits nothing in
 * the word bank, because a corrected verb is not vocabulary you learned.
 */
export const GateNote = z.object({
  corrected: z.string(),
  note: z.string(),
});
export type GateNote = z.infer<typeof GateNote>;

export const CardResponse = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('card'),
    card: WordCard,
    /**
     * The withheld wording, released now that the card has been delivered.
     * Null for a plain lookup, where there is nothing to apply.
     */
    replacement: z.string().nullable(),
    /** One alternative, offered on reject. Null when none is sensible. */
    alternative: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('note'),
    note: GateNote,
    replacement: z.string().nullable(),
    alternative: z.string().nullable(),
  }),
]);
export type CardResponse = z.infer<typeof CardResponse>;

// --- What the model itself returns -------------------------------------------
// The model selects from senses the dictionary supplied; it does not invent
// them. `word` and `lemma` are filled in server-side.

export const DictionarySense = z.object({
  senseId: z.string(),
  partOfSpeech: z.string(),
  definition: z.string(),
  example: z.string().optional(),
});
export type DictionarySense = z.infer<typeof DictionarySense>;

/**
 * Note what is absent: `pronunciation`. It is retrieved from the dictionary
 * alongside the senses, never generated — a model asked to produce IPA will
 * happily invent it, and invented pronunciation is the one error this product
 * cannot afford, because the learner has no way to notice it.
 */
export const ModelCard = z.object({
  /** Must be one of the senseIds supplied in the prompt. */
  senseId: z.string(),
  partOfSpeech: PartOfSpeech,
  definition: z.string(),
  synonyms: z.array(SynonymNuance).min(2).max(3),
  useCases: z.array(z.string()).length(2),
  register: Register,
  whyHere: z.string().nullable(),
  alternative: z.string().nullable(),
});
export type ModelCard = z.infer<typeof ModelCard>;

// --- Streaming ----------------------------------------------------------------
// `/card/stream` sends these as NDJSON while the model is still writing. The
// gate is not involved: by the time this call runs the reader has already
// opened it, and the withheld wording is released with the payload either way.
// What this buys is the wait — a card takes between four and thirteen seconds,
// and the definition is finished long before the examples are.
//
// As with `/propose/stream`, these are a preview: nothing is built from them,
// and `done` carries the same payload the non-streaming route returns.

/**
 * The line the reader came for, sent as soon as it is complete.
 *
 * Carries the word and its part of speech too, because a definition arriving
 * alone would render under a heading that is not there yet.
 */
export const StreamedDefinition = z.object({
  kind: z.literal('definition'),
  word: z.string(),
  partOfSpeech: PartOfSpeech,
  definition: z.string(),
});
export type StreamedDefinition = z.infer<typeof StreamedDefinition>;

export const StreamedSynonym = SynonymNuance.extend({
  kind: z.literal('synonym'),
});
export type StreamedSynonym = z.infer<typeof StreamedSynonym>;

export const StreamedUseCase = z.object({
  kind: z.literal('example'),
  text: z.string(),
});
export type StreamedUseCase = z.infer<typeof StreamedUseCase>;

/** The real payload: the whole card, the released wording, and the register. */
export const StreamedCard = z.object({
  kind: z.literal('done'),
  response: CardResponse,
});
export type StreamedCard = z.infer<typeof StreamedCard>;

export const StreamedCardError = z.object({
  kind: z.literal('error'),
  error: ApiError,
});
export type StreamedCardError = z.infer<typeof StreamedCardError>;

export const CardStreamEvent = z.discriminatedUnion('kind', [
  StreamedDefinition,
  StreamedSynonym,
  StreamedUseCase,
  StreamedCard,
  StreamedCardError,
]);
export type CardStreamEvent = z.infer<typeof CardStreamEvent>;
