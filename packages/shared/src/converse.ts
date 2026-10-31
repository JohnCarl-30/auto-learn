import { z } from 'zod';
import { MAX_KNOWN_WORDS, ProposeResponse } from './propose';

/**
 * The speaking partner: a short conversation, out loud, where every turn the
 * learner takes is also a sentence the gate can teach from.
 *
 * Writing is where the product started, but speaking is what a second-language
 * student is most anxious about, and the two halves it needs already exist —
 * dictation listens, the card speaks. This is the loop that joins them: say
 * something, hear an answer, and find out what a fluent speaker would have
 * said instead, behind the same gate as everything else.
 */

/**
 * Where the conversation happens. Each is a room a university student actually
 * has to talk in, rather than "practise English" in the abstract — a learner
 * rehearsing office hours wants the professor, not a pen pal.
 */
export const Scenario = z.enum([
  'office-hours',
  'seminar',
  'group-project',
  'free-talk',
]);
export type Scenario = z.infer<typeof Scenario>;

export const SCENARIO_LABELS: Record<Scenario, string> = {
  'office-hours': "Professor's office hours",
  seminar: 'Seminar discussion',
  'group-project': 'Group project meeting',
  'free-talk': 'Just talk',
};

/** One line of user-facing copy, so the choice is not a guess between four titles. */
export const SCENARIO_HINTS: Record<Scenario, string> = {
  'office-hours': 'Ask about an assignment, a grade, or an extension.',
  seminar: 'Argue for a position and answer a follow-up.',
  'group-project': 'Split the work and agree on a deadline.',
  'free-talk': 'Anything at all, at your own pace.',
};

/**
 * Who the partner is, sent to the model in the user half of the prompt.
 *
 * Kept out of the system prompt on purpose: that one is a constant so the
 * provider can serve it from cache, and four scenario variants would be four
 * prompts that are each cached a quarter as often.
 */
export const SCENARIO_CONTEXT: Record<Scenario, string> = {
  'office-hours':
    "You are a university lecturer holding office hours. The student has come to see you about your course. Be approachable but keep the professional distance a lecturer would.",
  seminar:
    'You are a fellow student in a university seminar on a topic the student chooses. Challenge their points politely and ask them to justify a claim.',
  'group-project':
    'You are a classmate in the same group project. Help plan who does what and by when, and push back if a plan sounds unrealistic.',
  'free-talk':
    'You are a friendly classmate chatting between lectures. Follow whatever topic the student brings up.',
};

/**
 * The partner's first line, with no model call behind it.
 *
 * Opening costs nothing this way and is the same every time, which is what a
 * nervous first turn wants: the learner can read it, hear it, and rehearse an
 * answer before anything is spent.
 */
export const SCENARIO_OPENERS: Record<Scenario, string> = {
  'office-hours': 'Come in, have a seat. What can I help you with today?',
  seminar:
    "Let's start with you. What topic do you want to discuss, and where do you stand on it?",
  'group-project':
    "Okay, the presentation is in two weeks. Which part of the project would you like to take on?",
  'free-talk': 'Hey! How has your week been so far?',
};

/**
 * How much of the conversation travels with each turn.
 *
 * The partner needs enough to stay on topic and not repeat itself; it does not
 * need the whole session, and every turn kept is input billed on every turn
 * after it. Twelve is six exchanges, which covers the follow-up a reply is
 * usually answering.
 */
export const MAX_HISTORY_TURNS = 12;

/**
 * One spoken turn is at most a minute of speech (MAX_RECORDING_SECONDS), and a
 * minute of speech is well under this. The cap bounds what a single request can
 * cost, the same job MAX_SENTENCES does for /propose.
 */
export const MAX_TURN_CHARS = 1000;

export const ConverseTurn = z.object({
  role: z.enum(['partner', 'learner']),
  text: z.string().min(1).max(MAX_TURN_CHARS),
});
export type ConverseTurn = z.infer<typeof ConverseTurn>;

export const ConverseRequest = z.object({
  scenario: Scenario,
  /** Earlier turns, oldest first, the opener included. Not this one. */
  history: z.array(ConverseTurn).max(MAX_HISTORY_TURNS),
  /** What the learner just said, after they had the chance to fix the transcript. */
  utterance: z.string().trim().min(1).max(MAX_TURN_CHARS),
  /** Banked lemmas, as on /propose, so feedback prefers a word not yet taught. */
  known: z.array(z.string()).max(MAX_KNOWN_WORDS).optional(),
});
export type ConverseRequest = z.infer<typeof ConverseRequest>;

/**
 * Why a turn came back without feedback. The reply still arrives either way:
 * the conversation is the product here, and a turn that went unreviewed is a
 * smaller loss than a partner who stops answering.
 */
export const FeedbackSkipped = z.enum([
  /** More than MAX_SENTENCES in one turn. The review refuses rather than truncates. */
  'too_many_sentences',
  /** The review call failed. The reply did not depend on it. */
  'unavailable',
]);
export type FeedbackSkipped = z.infer<typeof FeedbackSkipped>;

export const ConverseResponse = z.object({
  /** The partner's answer, plain text, written to be read aloud. */
  reply: z.string(),
  /**
   * The learner's turn reviewed exactly as a paste would be — same tiers, same
   * gate, same session handle, so /card opens it with no new route. Null when
   * `skipped` says why.
   */
  review: ProposeResponse.nullable(),
  skipped: FeedbackSkipped.nullable(),
});
export type ConverseResponse = z.infer<typeof ConverseResponse>;

/**
 * The turns a request should carry: the most recent, oldest first.
 *
 * The oldest are dropped rather than the newest because the reply is to what
 * was said last, and losing the opener matters less than losing the question
 * the learner is answering.
 */
export function recentTurns(
  turns: ConverseTurn[],
  max = MAX_HISTORY_TURNS,
): ConverseTurn[] {
  return turns.slice(Math.max(0, turns.length - max));
}

/**
 * A word to try using in this conversation, when the bank has none due.
 *
 * `known` is the bank's lemmas, as on /propose, so the partner does not offer a
 * word the learner already has. No session handle: nothing is opened until the
 * learner actually uses the word, and then it goes through /card like any
 * other tapped word.
 */
export const SessionWordRequest = z.object({
  scenario: Scenario,
  known: z.array(z.string()).max(MAX_KNOWN_WORDS),
});
export type SessionWordRequest = z.infer<typeof SessionWordRequest>;

/** The definition is WordNet's gloss, retrieved rather than generated. */
export const SessionWord = z.object({
  word: z.string(),
  definition: z.string(),
});
export type SessionWord = z.infer<typeof SessionWord>;

/** Null when no word could be found: talking never waits on this. */
export const SessionWordResponse = z.object({
  word: SessionWord.nullable(),
});
export type SessionWordResponse = z.infer<typeof SessionWordResponse>;
