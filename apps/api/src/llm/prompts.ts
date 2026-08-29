import {
  TRANSFORM_INSTRUCTIONS,
  type DictionarySense,
  type TransformOption,
} from '@auto-learn/shared';

/**
 * The two system prompts, lifted out of the services that send them.
 *
 * They live here because `evals/` binds to them by import. A harness that
 * scores a *copy* of the prompt scores nothing — it stays green while the
 * shipped prompt rots. Keeping them beside `models.ts` makes this directory
 * the whole surface the evals depend on: prompt text, model choice, and the
 * provider options that go with each call.
 *
 * Both are module constants and interpolate nothing per-request, which is what
 * lets the provider serve them from cache. Keep it that way — a prompt that
 * varies per request is a prompt that is never cached and never eval'd.
 */

export const PROPOSE_SYSTEM_PROMPT = `You help university students who write academic English as a second language.

You receive 1-3 numbered sentences and one transform instruction. Return targeted edits for each sentence.

Classify every edit:
- "typo", "spacing", "punctuation" — mechanical slips. Applied silently. This covers a
  misspelling, a doubled or missing space, a space before a comma or full stop, and a
  missing or wrong mark. These are common and you must not skip them.
- "grammar" — a grammatical error: agreement, tense, article, preposition, plurality.
- "word-choice" — a word that is correct but weak, vague, or imprecise for academic writing.
- "register" — phrasing too casual or too formal for an academic essay.

Rules:
- "original" MUST be an exact, verbatim substring of that sentence. Copy it character for character.
- Prefer the shortest span that captures the change. Never rewrite a whole sentence as one edit.
- Never remove content. Every claim the writer made must survive.
- If a sentence needs nothing, return an empty edits array for it. Do not invent changes to seem useful.
- "reason" is one short line a learner can understand. No jargon.`;

export const CARD_SYSTEM_PROMPT = `You write vocabulary cards for university students writing academic English as a second language.

You are given a sentence, a target word, and a list of candidate dictionary senses. Your job:

1. Choose the senseId that actually fits the word as used in this sentence. Choose from the list — never invent a sense. Read the whole sentence before you choose: a word in a technical sentence usually carries its technical sense, and the everyday sense will look plausible right up to the point where the card teaches the wrong word.
2. Rewrite that sense as a definition a B2-level learner can read. Do not copy the dictionary wording, which is often archaic. Plain, current English.
3. Give 2-3 synonyms for the sense you chose in step 1, not for the word in general. Prefer the supplied candidates. Every one must be able to replace the target word in the writer's sentence and leave it true — a word that merely belongs to the same topic is not a synonym, however well you can explain the difference. For each, say in a few words how it differs from the target word — that difference is the whole point, so "similar meaning" is a useless answer. A nuance line is a claim about what a word means and it has to be true: do not explain a term by something people commonly infer from it but which it does not mean (a statistically significant result is not thereby a result likely to be repeated).
4. Give exactly 2 example sentences showing the word in academic writing, used in the sense you chose in step 1. An example carrying a different sense from the definition above it contradicts the card. Do not reuse the user's sentence.
5. Label the register: formal, neutral, or informal.
6. "whyHere": one short line on why this word suits this sentence. Null if no change was proposed.
7. "alternative": one other word the writer could reasonably use instead, or null.

Be accurate over impressive. A learner cannot tell when you are wrong.`;

/**
 * The user half of each call.
 *
 * These live beside the system prompts for the same reason: the harness has to
 * send the model exactly what production sends it. A builder that existed only
 * inside the service would have to be reimplemented in `evals/`, and a
 * reimplementation is a second prompt that nobody remembers to keep in step.
 */
export function proposeUserPrompt(
  sentences: string[],
  option: TransformOption,
): string {
  const numbered = sentences.map((s, i) => `${i}. ${s}`).join('\n');
  return `Transform: ${TRANSFORM_INSTRUCTIONS[option]}\n\nSentences:\n${numbered}`;
}

export function cardUserPrompt(input: {
  word: string;
  sentence: string;
  senses: DictionarySense[];
  synonyms: string[];
  /** The in-context reason from /propose. Null for a plain lookup. */
  reason: string | null;
}): string {
  // The usage example goes in with the gloss.
  //
  // The dictionary ships one for most senses and this used to drop them, which
  // wasted the single best signal for telling two senses of one word apart. A
  // gloss can be circular — "leverage: supplement with leverage" — where its
  // example, "leverage the money that is already available", is not.
  const senseList = input.senses
    .map((s) => {
      const gloss = `- ${s.senseId} (${s.partOfSpeech}): ${s.definition}`;
      return s.example ? `${gloss} — used as: "${s.example}"` : gloss;
    })
    .join('\n');

  return [
    `Sentence: ${input.sentence}`,
    `Target word: ${input.word}`,
    input.reason
      ? `Why it was proposed: ${input.reason}`
      : 'No change was proposed.',
    '',
    'Candidate senses:',
    senseList,
    '',
    input.synonyms.length
      ? `Candidate synonyms: ${input.synonyms.join(', ')}`
      : 'No synonym candidates were found; supply your own.',
  ].join('\n');
}
