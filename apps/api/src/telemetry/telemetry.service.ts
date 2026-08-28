import { Injectable } from '@nestjs/common';
import type { TelemetrySnapshot } from '@auto-learn/shared';
import { priceCall, type RawUsage } from '../llm/pricing';

/**
 * In-memory counters, reset on restart. That is the right amount of machinery
 * for v1: these numbers only have to be good enough to answer "is anyone
 * opening the cards, and does anyone arrive with an essay". Persist them when
 * the answer starts mattering to someone other than us.
 */
@Injectable()
export class TelemetryService {
  private readonly since = new Date().toISOString();
  private readonly counts = {
    proposals: 0,
    overflowAttempts: 0,
    cardsRequested: 0,
    cardsDelivered: 0,
    cardsFailed: 0,
    editsDropped: 0,
    notesOpened: 0,
    lookups: 0,
    accepted: 0,
    rejected: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    spendUsd: 0,
  };

  proposal(): void {
    this.counts.proposals += 1;
  }

  /** An over-cap paste. The signal that decides whether v2 takes essays. */
  overflow(): void {
    this.counts.overflowAttempts += 1;
  }

  /** A gate was clicked. Intent, regardless of what happens next. */
  cardRequested(): void {
    this.counts.cardsRequested += 1;
  }

  /** A card actually reached the reader. */
  cardDelivered(): void {
    this.counts.cardsDelivered += 1;
  }

  /** The request was made but no card came back. */
  cardFailed(): void {
    this.counts.cardsFailed += 1;
  }

  /**
   * Edits the model returned that could not be placed in the sentence.
   *
   * Counted per sentence rather than per edit site, because what matters is
   * how much of a proposal was lost, not which loop dropped it.
   */
  editsDropped(count: number): void {
    if (count <= 0) return;
    this.counts.editsDropped += count;
  }

  noteOpened(): void {
    this.counts.notesOpened += 1;
  }

  lookup(): void {
    this.counts.lookups += 1;
  }

  accepted(): void {
    this.counts.accepted += 1;
  }

  rejected(): void {
    this.counts.rejected += 1;
  }

  /**
   * Tokens and money for one model call.
   *
   * Every model this app calls is in the price table by construction — the
   * table is keyed off the same two constants — so an unpriced call means the
   * model was changed without its price. Counted in tokens either way, since
   * losing the tokens too would hide the change completely.
   */
  spend(model: string, usage: RawUsage | undefined): void {
    // Accounting is not worth failing a request over: a provider that omits
    // usage would otherwise turn a delivered card into a 502.
    if (!usage) return;

    const call = priceCall(model, usage);
    this.counts.inputTokens += call.inputTokens;
    this.counts.cachedInputTokens += call.cachedInputTokens;
    this.counts.outputTokens += call.outputTokens;
    this.counts.spendUsd += call.usd ?? 0;
  }

  snapshot(): TelemetrySnapshot {
    return {
      ...this.counts,
      // Fractions of a cent are noise at this scale, and a float that prints
      // as 0.030000000000000002 reads as a bug in the counter.
      spendUsd: Number(this.counts.spendUsd.toFixed(4)),
      since: this.since,
    };
  }
}
