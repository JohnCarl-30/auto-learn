import { Injectable } from '@nestjs/common';
import type { TransformOption } from '@auto-learn/shared';
import {
  SESSION_TTL_MS,
  SessionStore,
  type ProposalSession,
  type StoredSentence,
} from './session.store';

/**
 * The two commands this needs, and nothing else.
 *
 * Narrow on purpose: it keeps `ioredis` out of the unit tests, which run
 * against a plain map implementing this interface, and it makes the surface
 * that could behave differently in production small enough to read.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttl: number): Promise<unknown>;
}

/** Namespaced, because a Redis is rarely one application's alone. */
const key = (sessionId: string) => `auto-learn:session:${sessionId}`;

/**
 * Sessions in Redis, which is what lets there be more than one API process.
 *
 * /propose writes the proposal here — including the tier-2 wordings the client
 * is deliberately not sent — and /card reads it back to release one. With the
 * store in process memory those two calls had to land in the same instance, so
 * the deploy was pinned to a single one and every restart dropped whatever
 * people were in the middle of reviewing.
 */
@Injectable()
export class RedisSessionStore extends SessionStore {
  constructor(private readonly redis: RedisLike) {
    super();
  }

  async create(
    option: TransformOption,
    sentences: StoredSentence[],
  ): Promise<ProposalSession> {
    const session = this.build(option, sentences);
    // Expiry is Redis's job rather than a sweeper of ours: it is the same
    // hour the in-memory store gives a session, enforced by the thing that
    // holds it.
    await this.redis.set(
      key(session.id),
      JSON.stringify(session),
      'PX',
      SESSION_TTL_MS,
    );
    return session;
  }

  async get(sessionId: string): Promise<ProposalSession | undefined> {
    const stored = await this.redis.get(key(sessionId));
    if (stored === null) return undefined;

    try {
      return JSON.parse(stored) as ProposalSession;
    } catch {
      // Written by a version that shaped sessions differently, or truncated.
      // An expired session is already a case the client handles — it says so
      // and asks for the sentence again — and that is the honest answer here
      // rather than a 500 about JSON.
      return undefined;
    }
  }
}
