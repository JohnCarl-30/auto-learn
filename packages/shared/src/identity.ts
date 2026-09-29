import { z } from 'zod';

/**
 * The contract between the web app's session and the API's guard.
 *
 * These two services authenticate people in completely different ways — the web
 * app owns the session cookie and the user table; the API owns nothing and only
 * needs to know who is calling. The bridge is a short-lived signed token, and
 * these constants are the parts of it that both sides have to agree on
 * character for character. They live here for the same reason the wire schemas
 * do: a mismatch between two repositories' worth of string literals is a
 * production-only failure, and a shared constant cannot mismatch.
 */
export const API_TOKEN_ISSUER = 'auto-learn/web';
export const API_TOKEN_AUDIENCE = 'auto-learn/api';

/**
 * Five minutes.
 *
 * This token is handed to the browser, so it is as exposed as anything else in
 * a tab, and it exists only to be attached to the request that is about to be
 * made. The web app mints a new one whenever it needs one — there is nothing to
 * refresh and no reason for one to outlive the call it was made for.
 */
export const API_TOKEN_TTL_SECONDS = 5 * 60;

/** What `GET /api/auth/api-token` answers with. */
export const ApiToken = z.object({
  token: z.string().min(1),
  /** Seconds. Lets a caller cache the token for its own lifetime, not guess it. */
  expiresIn: z.number().int().positive(),
});
export type ApiToken = z.infer<typeof ApiToken>;

/** What the API knows about a caller once the token checks out. */
export const Caller = z.object({
  id: z.string().min(1),
});
export type Caller = z.infer<typeof Caller>;
