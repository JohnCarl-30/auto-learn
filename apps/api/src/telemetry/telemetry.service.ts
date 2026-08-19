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
    cardsOpened: 0,
    notesOpened: 0,
    lookups: 0,
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

  cardOpened(): void {
    this.counts.cardsOpened += 1;
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

  snapshot(): TelemetrySnapshot {
    return { ...this.counts, since: this.since };
  }
}
