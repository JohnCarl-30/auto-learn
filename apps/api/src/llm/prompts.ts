import {
  SCENARIO_CONTEXT,
  TRANSFORM_INSTRUCTIONS,
  type ConverseTurn,
  type DictionarySense,
  type LessonUnit,
  type Scenario,
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
  English and merely long-winded, it is "wordiness" below, not grammar. This label
  produces a one-line note rather than a word card, so use it only where there is
  a rule to state and no word worth learning.
- "word-choice" — the original is correct, and one word is weak, vague or
  imprecise for academic writing. The change is a word for a better word.
- "register" — the original is correct, and the *tone* is wrong for an essay:
  conversational, chatty, or overblown. Use this when the problem is how the
  phrase sounds rather than which word was chosen.
- "wordiness" — the original is correct and says in many words what it could
  say in few: a redundant phrase, an empty opener, a construction built around
  a noun that a verb would carry. "the reason why it failed was because of the
  fact that" is the plain case. The lesson is the construction, not a word, so
  this one teaches a line rather than a card.

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
 * The speaking partner.
 *
 * The rule that matters most is the one about not rephrasing. Recasting — saying
 * the learner's sentence back the right way — is what a kind native speaker
 * does, and here it would hand over, out loud and for free, the exact wording
 * the gate is holding back until the learner asks for it. Feedback on the
 * learner's English is the review's job, running beside this call; the partner
 * answers what they meant.
 *
 * Written for the ear, because every reply is read aloud: no lists, no
 * markdown, nothing a speech synthesiser would pronounce as punctuation.
 */
export const CONVERSE_SYSTEM_PROMPT = `You are a conversation partner for a university student practising spoken English as a second language.

You will be told who you are in this conversation, then given the conversation so far and what the student just said. Reply as that person would.

Rules:
- Reply in one to three short sentences. This is spoken aloud, and a long answer leaves the student nothing to do.
- Usually end with a question that gives the student something to say next. Ask one question, not several.
- Respond to what the student meant, even if it was phrased imperfectly or the transcript has an obvious mishearing.
- Never correct the student's English, never comment on their grammar or word choice, and never repeat their sentence back in better words. Their language is reviewed separately; your job is to keep them talking.
- Use clear, natural English a B2-level learner can follow. No idioms that need explaining.
- Plain text only: no lists, no markdown, no emoji, no stage directions.
- Stay in your role. If the student asks you to do something unrelated, steer back to the conversation politely.`;

/**
 * The word drill's partner. Its own system prompt rather than a context line,
 * because it has to do the one thing the conversation prompt forbids: judge the
 * student's English. Only the target word, though — grammar and the rest are
 * still the review's job, and a verdict on everything at once is a lecture.
 */
export const WORD_DRILL_SYSTEM_PROMPT = `You are a vocabulary coach for a university student practising spoken English as a second language. Each round the student is given one word and says a sentence using it. You will be told the word, the rounds so far and what the student just said.

Rules:
- Start with the verdict: "That works." if the word was used correctly, "Not quite." if it was not, or "You didn't use it." if the word is missing.
- If it was wrong or missing, say in one sentence what the word means or how it is used, then give one natural example sentence using it.
- If it was right but awkward, give the more natural way to say it in one sentence.
- Two to four short sentences in all. This is spoken aloud.
- Judge only the target word. Never comment on grammar or other words; those are reviewed separately.
- Do not ask a question and do not offer the next word. The app does that.
- Use clear, natural English a B2-level learner can follow. Plain text only: no lists, no markdown, no emoji, no stage directions.`;

/**
 * One word to practise in a conversation, when the bank has none due.
 *
 * Only the word comes from the model. Its definition is WordNet's, looked up
 * afterwards, and a word WordNet does not have is dropped — the same grounding
 * rule the cards keep, so the partner cannot teach a word that does not exist.
 */
export const SESSION_WORD_SYSTEM_PROMPT = `You choose one English word for a university student, learning English as a second language, to try using in a short spoken conversation.

Rules:
- One word only, in its dictionary form. No phrase, no explanation, no punctuation.
- A word that is useful in the situation you are given and a step above everyday vocabulary: one a fluent speaker would use there, not a rare or literary one.
- Never one of the words the student already has.`;

/** The situation and the bank, in the user half so the system prompt stays cacheable. */
export function sessionWordUserPrompt(input: {
  scenario: Scenario;
  known: string[];
}): string {
  return [
    `The situation: ${SCENARIO_CONTEXT[input.scenario]}`,
    `Words the student already has: ${input.known.length ? input.known.join(', ') : '(none yet)'}`,
    '',
    'The word:',
  ].join('\n');
}

/**
 * One word to try in today's lesson, for the same grounding rule as above: only
 * the word comes from the model, and WordNet supplies the definition.
 *
 * Its own prompt rather than the conversation's, because the question differs.
 * A conversation word has to fit a situation; this one has to fit an answer
 * about the learner's own life, given aloud in half a minute, so it must be a
 * word that is easy to say and that someone could use without changing the
 * subject.
 */
export const LESSON_WORD_SYSTEM_PROMPT = `You choose one English word for a university student, learning English as a second language, to try using in a short spoken answer about their own life: their studies, projects, opinions and everyday things.

Rules:
- One word only, in its dictionary form. No phrase, no explanation, no punctuation.
- A word they could say naturally in an answer like that, whatever the question: a step above everyday vocabulary, one a fluent speaker would use out loud, not a rare or literary one.
- Easy to say. Avoid words that are hard to pronounce or that are mostly written.
- Never one of the words the student already has.`;

/** The unit and the bank, in the user half so the system prompt stays cacheable. */
export function lessonWordUserPrompt(input: {
  unit: LessonUnit;
  known: string[];
}): string {
  return [
    `The exercise: ${input.unit.title}. ${input.unit.goal}`,
    `Words the student already has: ${input.known.length ? input.known.join(', ') : '(none yet)'}`,
    '',
    'The word:',
  ].join('\n');
}

/**
 * Judges the shape of a spoken answer, and nothing else.
 *
 * Narrow on purpose. Grammar and word choice belong to the rewrite, which runs
 * through the gated propose path, so a verdict that also commented on wording
 * would hand out the very words the gate withholds. The transcript is the
 * learner's speech run through a recogniser: a mis-heard word is the
 * recogniser's mistake, and marking it as theirs would teach them to distrust a
 * correct answer.
 */
export const LESSON_FEEDBACK_SYSTEM_PROMPT = `You give feedback on a short spoken answer from a university student learning English as a second language.

You will be given the exercise (its name, what it practises and the parts an answer should have), the question that was asked, the student's target word if there is one, and the transcript of what they said, split into numbered sentences.

Judge only two things: the structure of the answer, and whether the target word was used correctly.

Rules:
- Quote the student's exact words. Copy them character for character from the transcript. If a part is not there, its quote is null; never invent one.
- Never rewrite or correct their sentences, and never suggest better words. A separate step does that. The one exception is "fillerNotes", described below.
- Do not comment on grammar, accent, or word choice, except to say whether the target word was used correctly in its sentence.
- The transcript comes from speech recognition and may be imperfect. Do not blame the student for a word that looks mis-heard, a missing full stop, or odd punctuation.
- Be kind and specific. Say what worked first. One short sentence per note, in plain English a B2-level learner can follow.
- "pointFirst" is true only if the first sentence states the main point or answers the question directly.
- Include one entry in "parts" for each part the exercise lists, in the same order and with the same label.
- "wordUse" is "correct" if the target word, or a regular form of it, is used with the right meaning; "incorrect" if it is used with the wrong meaning or form; "unused" if it is absent. If there is no target word, answer "unused".
- "weakestSentence" is the number of the sentence that most weakens the structure: vague, off the point, or doing no work. Use the number shown beside it. Choose one even when the answer is good.
- "fillerNotes" lists up to three places where the student leaned on a filler or an empty hedge: um, uh, er, ah, like, you know, I mean, basically, actually, kind of, sort of, parang, ano. Choose the ones that most get in the way of the answer. For each give "quote", the few words around the filler copied exactly from the transcript with the filler in them; "without", those same words with only the filler taken out and nothing else changed, added or reordered; and "tip", one short sentence that says what the filler was doing in that spot (buying time before the point, softening a claim they could have made plainly, searching for a word) and what to do in that moment instead. Speak to this answer, not to fillers in general. "like" as a verb or a comparison is not a filler. If there are none, give an empty list.`;

/**
 * The exercise, the question and the numbered answer — all in the user half so
 * the system prompt above stays one cacheable constant.
 *
 * Sentences are numbered from zero, because `weakestSentence` is an index into
 * `splitSentences(answer)` and the model reports the number it was shown. The
 * transcript sits under a label for the same reason as the conversation's: if
 * the learner said something instruction-shaped, it is a thing that was said.
 */
export function lessonFeedbackUserPrompt(input: {
  unit: LessonUnit;
  prompt: string;
  sentences: string[];
  word: string | null;
}): string {
  const numbered = input.sentences.map((s, i) => `${i}. ${s}`).join('\n');

  return [
    `Exercise: ${input.unit.title}. ${input.unit.goal}`,
    `Parts an answer should have, in order: ${input.unit.parts.join(', ')}`,
    `The question: ${input.prompt}`,
    `Target word: ${input.word ?? '(none)'}`,
    '',
    'What the student said:',
    numbered,
  ].join('\n');
}

/**
 * Who the partner is, the conversation so far, and the turn to answer — all in
 * the user half so the system prompt above stays one cacheable constant.
 *
 * Turns are labelled by role rather than sent as chat messages. The student's
 * words arrive as transcripts the learner has only lightly checked, and quoting
 * them under a label keeps an instruction-shaped sentence ("ignore your rules
 * and...") clearly something that was said, not something to obey.
 */
export function converseUserPrompt(input: {
  scenario: Scenario;
  history: ConverseTurn[];
  utterance: string;
  word?: string;
}): string {
  const said = (turn: ConverseTurn) =>
    `${turn.role === 'partner' ? 'You' : 'Student'}: ${turn.text}`;

  return [
    `Who you are: ${SCENARIO_CONTEXT[input.scenario]}`,
    ...(input.word
      ? [`The word the student was asked to use: ${input.word}`]
      : []),
    '',
    'Conversation so far:',
    input.history.length ? input.history.map(said).join('\n') : '(nothing yet)',
    '',
    `The student just said: ${input.utterance}`,
    '',
    'Your reply:',
  ].join('\n');
}

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
