import { z } from 'zod';

/**
 * Three questions decide what v2 is, and nothing else here is worth counting:
 *
 *   1. Do people arrive with essays?      -> overflowAttempts
 *   2. Do they engage the gate at all?    -> cardsOpened / proposals
 *   3. Do they take the suggestions?      -> accepted vs rejected
 *
 * Accept and reject happen in the browser, so the client reports those two.
 * Everything else the server already sees.
 */
export const TelemetryEvent = z.object({
  event: z.enum(['suggestion_accepted', 'suggestion_rejected']),
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
  notesOpened: z.number().int(),
  lookups: z.number().int(),
  /** Whether anyone speaks rather than types. The only voice number worth keeping. */
  dictations: z.number().int(),
  accepted: z.number().int(),
  rejected: z.number().int(),
  since: z.string(),
});
export type TelemetrySnapshot = z.infer<typeof TelemetrySnapshot>;
