import { z } from 'zod';
import { inflectionsOf } from './reuse';
import { UnitIdSchema } from './lesson-path';
import { MAX_KNOWN_WORDS, ProposeResponse } from './propose';

/**
 * The daily lesson's wire contracts and the two pieces of answer arithmetic
 * that need no model: counting spoken fillers, and checking a recalled word.
 *
 * Sections: limits, then the pure helpers, then the request and response
 * shapes. New contracts go at the bottom, under their own heading.
 */

// --- Limits -------------------------------------------------------------------

/**
 * How long a lesson answer may run. The browser stops the recorder here; the
 * server can only see bytes, so `MAX_RECORDING_BYTES` is sized to hold this much
 * audio at a worst-case bitrate (see dictate.ts).
 */
export const MAX_LESSON_RECORDING_SECONDS = 120;

/**
 * The longest answer text a feedback request accepts. A 120 s answer is roughly
 * 300 words, so this is generous for speech and exists to bound the prompt for
 * someone who types or pastes instead.
 */
export const MAX_ANSWER_CHARS = 3000;

// --- Fillers ------------------------------------------------------------------

/**
 * The filler words the lesson counts in a spoken answer.
 *
 * Includes the Taglish ones ("parang", "ano") because the learners this is for
 * reach for those first when they lose the English word.
 */
export const FILLERS = [
  'um',
  'uh',
  'er',
  'ah',
  'you know',
  'i mean',
  'basically',
  'parang',
  'ano',
  'like',
] as const;

/**
 * One pass over the transcript for every filler, so a span can only be counted
 * once. Longest first, so a multi-word filler is tried before anything that
 * could start inside it, and the spaces inside one match any whitespace because
 * a transcript can break a line between the two words.
 *
 * "like" is the exception, and gets its own branch: it is a verb and a
 * preposition far more often than a filler, and the transcriber's comma is the
 * only signal that separates them ("it was like, huge" against "I like
 * coffee"). Miscounting the verb blames the learner for correct English, so it
 * counts only with a comma directly after it. A comma before it is not enough:
 * "things, like coffee" introduces an example. The lookbehind keeps hyphenated
 * words such as "child-like," out.
 */
const FILLER_PATTERN = new RegExp(
  `\\b(${FILLERS.filter((word) => word !== 'like')
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(' ', '\\s+'))
    .join('|')})\\b|(?<![\\w-])(like)(?=\\s*,)`,
  'g',
);

/**
 * Counts the fillers in a transcript, in total and per word.
 *
 * Keys are the entries of `FILLERS`, spelled the same way whatever the
 * transcript's case or line breaks. Plain string work: it runs on the
 * transcript the learner can see, so the number is one they can check.
 */
export function countFillers(transcript: string): {
  total: number;
  byWord: Record<string, number>;
} {
  const byWord: Record<string, number> = {};
  let total = 0;

  for (const match of transcript.toLowerCase().matchAll(FILLER_PATTERN)) {
    const word = (match[1] ?? match[2]).replace(/\s+/g, ' ');
    byWord[word] = (byWord[word] ?? 0) + 1;
    total += 1;
  }

  return { total, byWord };
}

// --- Recall -------------------------------------------------------------------

/**
 * Whether a typed answer is the word being recalled.
 *
 * Accepts the lemma and the same closed set of regular inflections that
 * `findReused` credits, so the drill and the reuse reward agree on what counts
 * as the word. Nothing looser: a near miss is shown the answer, not marked right.
 */
export function isRecallCorrect(answer: string, lemma: string): boolean {
  const given = answer.trim().toLowerCase();
  const base = lemma.toLowerCase();
  return given !== '' && (given === base || inflectionsOf(base).includes(given));
}

// --- Fetching the lesson's word and getting feedback ------------------------------

/**
 * Asks for a target word for the lesson. The response reuses the speaking
 * partner's `SessionWordResponse`, so the same picker serves both.
 *
 * `known` is the bank as the client holds it (the server keeps no copy), so the
 * word is one the learner has not been taught yet.
 */
export const LessonWordRequest = z.object({
  unit: UnitIdSchema,
  known: z.array(z.string()).max(MAX_KNOWN_WORDS),
});
export type LessonWordRequest = z.infer<typeof LessonWordRequest>;

/**
 * An answer to a lesson prompt, typed or transcribed, to be reviewed.
 *
 * `promptId` names the prompt so the model is shown what was asked. `word` is
 * the unit's target word, or null in units that have none. `known` is optional
 * because a cleared browser or a learner who has banked nothing is a normal
 * request, as with `ProposeRequest`.
 */
export const LessonFeedbackRequest = z.object({
  unit: UnitIdSchema,
  promptId: z.string(),
  answer: z.string().trim().min(1).max(MAX_ANSWER_CHARS),
  word: z.string().nullable(),
  known: z.array(z.string()).max(MAX_KNOWN_WORDS).optional(),
});
export type LessonFeedbackRequest = z.infer<typeof LessonFeedbackRequest>;

/** Whether the learner used the target word, and used it correctly. */
export const WordUse = z.enum(['correct', 'incorrect', 'unused']);
export type WordUse = z.infer<typeof WordUse>;

/**
 * One part of the shape the unit asks for, and where the answer showed it.
 * `quote` is the learner's own words that did it, or null when the part is
 * missing. A quote the server cannot find in the answer is its problem to drop.
 */
export const LessonPart = z.object({
  label: z.string(),
  quote: z.string().nullable(),
});
export type LessonPart = z.infer<typeof LessonPart>;

/**
 * What the model itself returns for an answer, before the server adds the
 * things it computes. Kept separate from the response for the same reason as
 * `ModelEdit`: the model reports judgement, never data the server can derive.
 *
 * `weakestSentence` is a 0-based index into `splitSentences(answer)`.
 */
export const ModelLessonVerdict = z.object({
  pointFirst: z.boolean(),
  pointFirstNote: z.string(),
  parts: z.array(LessonPart),
  structureNote: z.string(),
  wordUse: WordUse,
  weakestSentence: z.number().int(),
});
export type ModelLessonVerdict = z.infer<typeof ModelLessonVerdict>;

/**
 * The feedback the learner sees.
 *
 * `wordUse` is null when the lesson had no target word. `review` is the
 * gated proposal for the weakest sentence, and `reviewedText` is exactly the
 * text that was sent to propose to get it, so the client can `splitSentences`
 * it to find the sentence indexes for `/card` lookups, as use-conversation.ts
 * does. Both are null when there was nothing to review.
 */
export const LessonFeedbackResponse = z.object({
  firstSentence: z.string(),
  pointFirst: z.boolean(),
  pointFirstNote: z.string(),
  parts: z.array(LessonPart),
  structureNote: z.string(),
  wordUse: WordUse.nullable(),
  reviewedText: z.string().nullable(),
  review: ProposeResponse.nullable(),
});
export type LessonFeedbackResponse = z.infer<typeof LessonFeedbackResponse>;

// --- Lesson state: progress, completions and word reviews --------------------

/**
 * Everything the path and the lesson screen need to draw themselves, in one
 * read. Derived on the server from the completions table and the bank, so a
 * second device shows the same streak and the same unlocked unit.
 *
 * `counts` is completed lessons per unit, keyed by the unit number as a string
 * because JSON object keys are strings; a unit with none is simply absent.
 * `recentPromptIds` is newest first, across every unit, and is what
 * `pickPrompt` steers clear of. `dueEntryIds` are bank words whose review is
 * due, most overdue first; three at most, so a lesson never opens with a pile.
 */
export const LessonProgress = z.object({
  xp: z.number().int(),
  streak: z.number().int(),
  doneToday: z.number().int(),
  counts: z.record(z.string(), z.number().int()),
  highestUnlocked: UnitIdSchema,
  pathFinished: z.boolean(),
  recentPromptIds: z.array(z.string()).max(20),
  dueEntryIds: z.array(z.string()).max(3),
});
export type LessonProgress = z.infer<typeof LessonProgress>;

/**
 * A finished lesson. There is no xp here on purpose: the server works it out
 * from the two flags, so the number cannot be asked for. The response is the
 * refreshed `LessonProgress`.
 */
export const LessonCompleteRequest = z.object({
  unit: UnitIdSchema,
  promptId: z.string().min(1),
  wordCorrect: z.boolean(),
  retried: z.boolean(),
});
export type LessonCompleteRequest = z.infer<typeof LessonCompleteRequest>;

/** One answer in the word review. The response is `{ ok: true }`. */
export const ReviewAnswerRequest = z.object({
  entryId: z.string().min(1),
  right: z.boolean(),
});
export type ReviewAnswerRequest = z.infer<typeof ReviewAnswerRequest>;
