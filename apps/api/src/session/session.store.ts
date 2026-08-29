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

/**
 * Where a proposal lives between /propose writing it and /card opening it.
 *
 * Abstract because there are two, chosen at boot by whether REDIS_URL is set.
 * The methods are async for the sake of the one that talks over a socket —
 * the in-memory implementation answers immediately and pays nothing for the
 * signature.
 */
@Injectable()
export abstract class SessionStore {
  abstract create(
    option: TransformOption,
    sentences: StoredSentence[],
  ): Promise<ProposalSession>;

  abstract get(sessionId: string): Promise<ProposalSession | undefined>;

  /**
   * Both lookups below are derived from `get` rather than stored separately.
   *
   * A suggestion index would be a second thing to expire, and a session whose
   * index outlived its sentences would hand the card service a replacement
   * with no sentence to put it in.
   */
  async findSuggestion(
    sessionId: string,
    suggestionId: string,
  ): Promise<
    { sentence: StoredSentence; suggestion: StoredGated } | undefined
  > {
    const session = await this.get(sessionId);
    if (!session) return undefined;

    for (const sentence of session.sentences) {
      const suggestion = sentence.gated.find((g) => g.id === suggestionId);
      if (suggestion) return { sentence, suggestion };
    }
    return undefined;
  }

  async findSentence(
    sessionId: string,
    index: number,
  ): Promise<StoredSentence | undefined> {
    const session = await this.get(sessionId);
    return session?.sentences.find((s) => s.index === index);
  }

  protected build(
    option: TransformOption,
    sentences: StoredSentence[],
  ): ProposalSession {
    return { id: randomUUID(), option, createdAt: Date.now(), sentences };
  }
}

/** An hour: a session is meaningful only while someone reviews one paste. */
export const SESSION_TTL_MS = 60 * 60 * 1000;

/**
 * The default, and correct whenever there is one API process.
 *
 * Losing a session on restart costs a re-submit, which is a fair price for
 * having no infrastructure at all. It stops being fair the moment there are
 * two instances: the card request lands in a process that never saw the
 * proposal, and the gate — the whole mechanic — returns session_not_found.
 */
@Injectable()
export class MemorySessionStore extends SessionStore {
  private readonly cache = new LRUCache<string, ProposalSession>({
    max: 5_000,
    ttl: SESSION_TTL_MS,
  });

  create(
    option: TransformOption,
    sentences: StoredSentence[],
  ): Promise<ProposalSession> {
    const session = this.build(option, sentences);
    this.cache.set(session.id, session);
    return Promise.resolve(session);
  }

  get(sessionId: string): Promise<ProposalSession | undefined> {
    return Promise.resolve(this.cache.get(sessionId));
  }
}
