import { z } from 'zod';

/**
 * Three questions decide what v2 is, and nothing else here is worth counting:
 *
 *   1. Do people arrive with essays?      -> overflowAttempts
 *   2. Do they engage the gate at all?    -> cardsDelivered / proposals
 *   3. Do they take the suggestions?      -> accepted vs rejected
 *
 * And one that guards the other three: is the gate still working at all?
 * -> editsDropped. An edit whose span cannot be located is discarded rather
 * than guessed at, which is right, but it means the model drifting produces
 * fewer gates instead of an error. Without this count that reads as quiet
 * success — proposals climbing while the thing proposals exist to produce
 * thins out.
 *
 * Accept and reject happen in the browser, so the client reports those two.
 * Everything else the server already sees.
 */
export const TelemetryEvent = z.object({
  event: z.enum([
    'suggestion_accepted',
    'suggestion_rejected',
    'drill_started',
    'drill_finished',
    'word_recalled',
    'word_forgotten',
  ]),
});
export type TelemetryEvent = z.infer<typeof TelemetryEvent>;

export const TelemetrySnapshot = z.object({
  proposals: z.number().int(),
  /** Over-cap pastes. The demand signal for whole-essay mode. */
  overflowAttempts: z.number().int(),
  /**
   * Requested is intent — a gate was clicked. Delivered is the card actually
   * reaching the reader. They differ whenever the dictionary or the model
   * fails, and conflating them inflates the engagement ratio with failures.
   */
  cardsRequested: z.number().int(),
  cardsDelivered: z.number().int(),
  cardsFailed: z.number().int(),
  /**
   * Model edits discarded because their `original` was not a verbatim span of
   * the sentence. A few are normal. A rising share against `proposals` means
   * the prompt or the model has moved.
   */
  editsDropped: z.number().int(),
  notesOpened: z.number().int(),
  lookups: z.number().int(),
  /**
   * Whether anyone speaks rather than types.
   *
   * A pair for the same reason cards are one: a dictation that produced no
   * transcript is not someone declining to use the feature, it is the feature
   * not working for them. Counting only the successes would make a voice
   * feature that is failing look exactly like one nobody wants — which is the
   * decision these numbers exist to inform.
   */
  dictations: z.number().int(),
  dictationsFailed: z.number().int(),
  accepted: z.number().int(),
  rejected: z.number().int(),
  /**
   * The fourth question, which nothing answered.
   *
   * The three above decide whether people arrive, engage the gate and take
   * what it offers. This product's claim is the one after that — you keep the
   * word — and the drill is the only place it could be observed. It reported
   * nothing at all, on the mechanic the product is named for.
   *
   * Started against finished is whether a drill is worth doing; recalled
   * against forgotten is whether the bank sticks. Both are self-marked, which
   * makes them softer than the counts above and still the only evidence there
   * is.
   *
   * One caveat worth holding: the bank is per-browser, so until it syncs these
   * describe one device, and a low recall rate may be someone's second device
   * rather than their memory.
   */
  drillsStarted: z.number().int(),
  drillsFinished: z.number().int(),
  wordsRecalled: z.number().int(),
  wordsForgotten: z.number().int(),
  /**
   * What the model calls have actually cost since this process started.
   *
   * Kept beside the engagement counts because the two only mean anything
   * together: cards delivered is a success number until you divide it by what
   * the cards cost. Cached input is broken out separately because it is nine
   * tenths cheaper, and a total that hides it makes the prompt-cache work look
   * like it did nothing.
   */
  inputTokens: z.number().int(),
  cachedInputTokens: z.number().int(),
  outputTokens: z.number().int(),
  /**
   * The text models only — propose and card.
   *
   * It said "the model calls" until the voice routes were checked against it
   * and turned out to be missing. They are billed in credits against a monthly
   * plan rather than per token, so there is no honest per-call dollar figure to
   * add here; what they cost is measured below in the units the provider
   * actually counts. A number that quietly excluded them was worse than a
   * narrower one that says what it covers.
   */
  spendUsd: z.number(),
  /**
   * What the voice routes consumed, in the units they are billed in.
   *
   * `pronunciations` counts what the reader asked for and `charactersSpoken`
   * only what was actually synthesised, so the gap between them is what the
   * cache saved.
   */
  pronunciations: z.number().int(),
  charactersSpoken: z.number().int(),
  secondsTranscribed: z.number(),
  since: z.string(),
});
export type TelemetrySnapshot = z.infer<typeof TelemetrySnapshot>;
