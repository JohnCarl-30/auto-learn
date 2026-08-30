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
    dictations: 0,
    dictationsFailed: 0,
    accepted: 0,
    rejected: 0,
    drillsStarted: 0,
    drillsFinished: 0,
    wordsRecalled: 0,
    wordsForgotten: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    spendUsd: 0,
    pronunciations: 0,
    charactersSpoken: 0,
    secondsTranscribed: 0,
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

  /**
   * A recording arrived and no transcript went back — the provider fell over,
   * or there was nothing audible in it.
   *
   * Counted whichever end was at fault. From where the reader sits both are
   * "I spoke and it did not work", and it is their willingness to try again
   * that this is measuring.
   */
  dictationFailed(): void {
    this.counts.dictationsFailed += 1;
  }

  accepted(): void {
    this.counts.accepted += 1;
  }

  rejected(): void {
    this.counts.rejected += 1;
  }

  /** A drill was begun. Against `drillFinished`, this is how many are abandoned. */
  drillStarted(): void {
    this.counts.drillsStarted += 1;
  }

  drillFinished(): void {
    this.counts.drillsFinished += 1;
  }

  /** Self-marked at the card, after the word was shown. */
  wordRecalled(): void {
    this.counts.wordsRecalled += 1;
  }

  wordForgotten(): void {
    this.counts.wordsForgotten += 1;
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

  /**
   * A word was asked for out loud, whether or not it had to be synthesised.
   *
   * Counted separately from the characters below because the two answer
   * different questions: this one is "does anyone use the button", which
   * nothing recorded at all, and that one is "what did it cost".
   */
  pronunciation(): void {
    this.counts.pronunciations += 1;
  }

  /** Characters actually sent for synthesis. A cache hit sends none. */
  spoke(characters: number): void {
    if (characters <= 0) return;
    this.counts.charactersSpoken += characters;
  }

  /** Audio actually transcribed, in seconds — the unit that route is billed in. */
  transcribed(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.counts.secondsTranscribed += seconds;
  }

  snapshot(): TelemetrySnapshot {
    return {
      ...this.counts,
      // Fractions of a cent are noise at this scale, and a float that prints
      // as 0.030000000000000002 reads as a bug in the counter.
      spendUsd: Number(this.counts.spendUsd.toFixed(4)),
      secondsTranscribed: Number(this.counts.secondsTranscribed.toFixed(1)),
      since: this.since,
    };
  }
}
