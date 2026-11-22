import { createMiddleware } from 'hono/factory';
import type { ApiError } from '@auto-learn/shared';

const minutes = (n: number) => n * 60_000;

/**
 * Request-volume limits, per IP.
 *
 * /propose and /card each spend a model call and neither sits behind a login,
 * so a public URL is an open invitation to spend ANTHROPIC_API_KEY. MAX_SENTENCES
 * bounds what a single request can cost; until now nothing bounded how many of
 * them could arrive.
 *
 * The numbers come from the shape of one honest session: a paste is a single
 * /propose followed by an opening per gate, so cards have to be far looser than
 * proposals. Someone reviewing quickly should never meet these.
 *
 * Per-IP is a weak key, and deliberately so — it is the proportionate measure
 * while there is no account to key on, not a defence against a distributed
 * caller.
 */
export const RATE_LIMITS = {
  /** Everything not named below, the telemetry pings included. */
  default: { ttl: minutes(1), limit: 120 },
  propose: { ttl: minutes(1), limit: 10 },
  card: { ttl: minutes(1), limit: 60 },
  /**
   * One dictation stands in for one paste, so it gets the same allowance as
   * the /propose it is about to feed. Speaking is slower than pasting; anyone
   * meeting this is not dictating sentences.
   */
  dictate: { ttl: minutes(1), limit: 10 },
  /**
   * Looser, like /card and for the same reason: hearing every word you are
   * taught is the good case. Most of these never reach a provider at all,
   * because the audio is either the dictionary's own URL or already cached.
   */
  speak: { ttl: minutes(1), limit: 60 },
  /**
   * A spoken turn is a reply and a review, so two model calls — but it stands
   * in for one paste, and nobody holding a conversation takes more than a few
   * turns a minute. Same allowance as /propose and /dictate, which every turn
   * also pairs with.
   */
  converse: { ttl: minutes(1), limit: 10 },
  /**
   * One word per conversation started, and only when the bank has none due.
   * Five a minute is someone flicking between rooms; more is not practice.
   */
  sessionWord: { ttl: minutes(1), limit: 5 },
  /** A verdict and a rewrite, two model calls like a conversation turn, so the same allowance. */
  lesson: { ttl: minutes(1), limit: 10 },
  /** One word per lesson, fetched when the step opens; five a minute is flicking between units. */
  lessonWord: { ttl: minutes(1), limit: 5 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * The client's address, as one trusted proxy hop reports it: the last entry of
 * X-Forwarded-For is what the host's load balancer appended. Trusting the
 * whole chain would let a client name its own address in that header and step
 * around the limit entirely.
 */
function clientIp(forwardedFor: string | undefined): string {
  return forwardedFor?.split(',').pop()?.trim() || 'local';
}

const windows = new Map<string, { count: number; resetAt: number }>();

/** Empties every counter, for tests that send more than one window's worth. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * One counter per limit name and address. Routes that are the same spend —
 * /propose and /propose/stream — share a name, so a second route is not a
 * second door to the same budget.
 *
 * shortcut: counters live in this process, so on serverless each instance
 * counts on its own; move them to Redis (REDIS_URL is already there) when a
 * limit has to hold across instances.
 */
export function rateLimit(name: RateLimitName) {
  const { ttl, limit } = RATE_LIMITS[name];

  return createMiddleware(async (c, next) => {
    const key = `${name}:${clientIp(c.req.header('x-forwarded-for'))}`;
    const now = Date.now();
    let window = windows.get(key);

    if (!window || window.resetAt <= now) {
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      }
      window = { count: 0, resetAt: now + ttl };
      windows.set(key, window);
    }

    if (++window.count > limit) {
      c.header('Retry-After', String(Math.ceil((window.resetAt - now) / 1000)));
      // The browser parses every failure with `ApiError`; any other shape
      // arrives as "The server sent back something unexpected."
      return c.json(
        {
          code: 'rate_limited',
          message:
            'Too many requests in a short time. Wait a moment, then try again.',
        } satisfies ApiError,
        429,
      );
    }

    await next();
  });
}
