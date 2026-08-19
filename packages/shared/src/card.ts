import { z } from 'zod';

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
  /** One line. Not a panel — people read edit rationale twice and never again. */
  whyHere: z.string(),
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

export const CardResponse = z.object({
  card: WordCard,
  /**
   * The withheld wording, released now that the card has been delivered.
   * Null for a plain lookup, where there is nothing to apply.
   */
  replacement: z.string().nullable(),
  /** One alternative, offered if the user rejects. Null when none is sensible. */
  alternative: z.string().nullable(),
});
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

export const ModelCard = z.object({
  /** Must be one of the senseIds supplied in the prompt. */
  senseId: z.string(),
  partOfSpeech: PartOfSpeech,
  definition: z.string(),
  synonyms: z.array(SynonymNuance).min(2).max(3),
  useCases: z.array(z.string()).length(2),
  register: Register,
  whyHere: z.string(),
  alternative: z.string().nullable(),
});
export type ModelCard = z.infer<typeof ModelCard>;
