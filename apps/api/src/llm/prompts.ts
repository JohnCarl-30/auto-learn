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
  missing or wrong mark. These are common and you must not skip them. Span the
  words on both sides of the punctuation, so the result reads correctly:
  "employment ,and" becomes "employment, and".
- "grammar" — the original is *wrong*: agreement, tense, article, preposition, plurality.
  Ask whether a teacher would mark it as an error. If the original is acceptable
  English and merely clumsy, wordy or repetitive, it is not grammar. This label
  produces a one-line note rather than a word card, so use it only where there is
  a rule to state and no word worth learning.
- "word-choice" — the original is correct, and one word is weak, vague or
  imprecise for academic writing. The change is a word for a better word.
- "register" — the original is correct, and the *tone* is wrong for an essay:
  conversational, chatty, or overblown. Use this when the problem is how the
  phrase sounds rather than which word was chosen.

When two of those seem to fit, the tie-breaker is what is being replaced: a
single content word swapped for a better one is "word-choice", even if the old
word was also casual; a phrase or construction restyled is "register".

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
/**
 * The rule that reads the bank, added only for requests that carry one.
 *
 * It cannot live in the constant above, and the reason is measured rather than
 * guessed: with the rule present, "big" in "a big effect" came back labelled
 * register instead of word-choice three or four times out of four; without it,
 * four out of four correct. Merely mentioning word preference shifts how the
 * model tiers an unrelated edit, and it did so on requests carrying no bank at
 * all — every reader paying for a rule that only some of them can use.
 *
 * So there are two system prompts. A reader with an empty bank gets the one
 * that has always existed, byte for byte. A reader with a bank gets the rule
 * and whatever classification drift comes with it, which is a trade they are
 * at least getting something for.
 */
const PREFER_UNMET = `
- Some requests list words the writer has already learned. When more than one word would fix the sentence equally well, propose one that is NOT on that list — they have had that lesson already. Use a listed word when nothing else fits, because the sentence matters more than the lesson.`;

export function proposeSystemPrompt(known: string[] = []): string {
  return known.length
    ? PROPOSE_SYSTEM_PROMPT + PREFER_UNMET
    : PROPOSE_SYSTEM_PROMPT;
}

export function proposeUserPrompt(
  sentences: string[],
  option: TransformOption,
  /** Lemmas the writer has already been taught. */
  known: string[] = [],
): string {
  const numbered = sentences.map((s, i) => `${i}. ${s}`).join('\n');

  /*
    Listed as words already learned rather than as words to avoid.

    The distinction decides what happens when the banked word is genuinely the
    right fix: "avoid these" would make the correction worse to protect the
    lesson, which is backwards. The sentence comes first, and the preference
    only settles a tie.
  */
  const learned = known.length
    ? `\n\nAlready learned: ${known.join(', ')}`
    : '';

  return `Transform: ${TRANSFORM_INSTRUCTIONS[option]}${learned}\n\nSentences:\n${numbered}`;
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
