import { Injectable } from '@nestjs/common';
import type { TelemetrySnapshot } from '@auto-learn/shared';

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
    notesOpened: 0,
    lookups: 0,
    dictations: 0,
    accepted: 0,
    rejected: 0,
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

  noteOpened(): void {
    this.counts.notesOpened += 1;
  }

  lookup(): void {
    this.counts.lookups += 1;
  }

  /**
   * Someone spoke instead of typing. The one voice number worth keeping: it
   * answers whether the feature is used at all, which is what decides if it
   * earns more investment. Plays are not counted — most are served straight
   * from the dictionary's own URLs and never reach us, so any figure here
   * would undercount in a way that misleads rather than informs.
   */
  dictation(): void {
    this.counts.dictations += 1;
  }

  accepted(): void {
    this.counts.accepted += 1;
  }

  rejected(): void {
    this.counts.rejected += 1;
  }

  snapshot(): TelemetrySnapshot {
    return { ...this.counts, since: this.since };
  }
}
