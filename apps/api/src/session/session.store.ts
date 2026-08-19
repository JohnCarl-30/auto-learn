import { Injectable } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { randomUUID } from 'node:crypto';
import type {
  GatedSuggestionType,
  SilentFix,
  TransformOption,
} from '@auto-learn/shared';

/**
 * A gated suggestion as the server holds it — including `replacement`, which
 * is deliberately absent from the wire type sent to the client. Releasing it
 * is what opening the card does.
 */
export interface StoredGated {
  id: string;
  type: GatedSuggestionType;
  original: string;
  start: number;
  end: number;
  teaser: string;
  replacement: string;
  /** The model's one-line rationale; seeds the card's `whyHere`. */
  reason: string;
}

export interface StoredSentence {
  index: number;
  original: string;
  /** Tier-1 fixes already applied. All spans are offsets into this. */
  text: string;
  silentFixes: SilentFix[];
  gated: StoredGated[];
}

export interface ProposalSession {
  id: string;
  option: TransformOption;
  createdAt: number;
  sentences: StoredSentence[];
}

@Injectable()
export class SessionStore {
  /**
   * In-memory is correct for v1: a session is meaningful only while the user
   * is reviewing one paste, and losing it on restart costs a re-submit. It
   * becomes Redis when there is more than one API instance.
   */
  private readonly cache = new LRUCache<string, ProposalSession>({
    max: 5_000,
    ttl: 60 * 60 * 1000,
  });

  create(
    option: TransformOption,
    sentences: StoredSentence[],
  ): ProposalSession {
    const session: ProposalSession = {
      id: randomUUID(),
      option,
      createdAt: Date.now(),
      sentences,
    };
    this.cache.set(session.id, session);
    return session;
  }

  get(sessionId: string): ProposalSession | undefined {
    return this.cache.get(sessionId);
  }

  findSuggestion(
    sessionId: string,
    suggestionId: string,
  ): { sentence: StoredSentence; suggestion: StoredGated } | undefined {
    const session = this.cache.get(sessionId);
    if (!session) return undefined;

    for (const sentence of session.sentences) {
      const suggestion = sentence.gated.find((g) => g.id === suggestionId);
      if (suggestion) return { sentence, suggestion };
    }
    return undefined;
  }

  findSentence(sessionId: string, index: number): StoredSentence | undefined {
    return this.cache.get(sessionId)?.sentences.find((s) => s.index === index);
  }
}
