import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, minutes } from '@nestjs/throttler';
import type { ApiError } from '@auto-learn/shared';

/**
 * Request-volume limits, per IP.
 *
 * /propose and /card each spend a model call and neither sits behind a login,
 * so a public URL is an open invitation to spend OPENAI_API_KEY. MAX_SENTENCES
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
} as const;

/**
 * The throttler's own 429 body does not match `ApiError`, and the browser parses
 * every failure with that schema — an unmapped shape arrives as the generic
 * "The server sent back something unexpected." Say what actually happened, in
 * the same shape as every other refusal.
 */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(): Promise<void> {
    const error: ApiError = {
      code: 'rate_limited',
      message:
        'Too many requests in a short time. Wait a moment, then try again.',
    };

    throw new HttpException(error, HttpStatus.TOO_MANY_REQUESTS);
  }
}
