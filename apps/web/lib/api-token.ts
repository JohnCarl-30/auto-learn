import { ApiToken } from '@auto-learn/shared';

/**
 * The token the API wants on every call that spends the key.
 *
 * The API is another origin and cannot read the session cookie, so the web app
 * mints it a five-minute assertion (`/api/auth/api-token`) and the browser
 * carries that across. This module is the only thing that asks for one.
 */
const TOKEN_ROUTE = '/api/auth/api-token';

/**
 * How early a cached token is retired.
 *
 * A token that expires in flight is refused by the API, and the reader sees a
 * sign-in prompt they did nothing to earn. A minute covers a slow upload.
 */
const REFRESH_MARGIN_MS = 60_000;

// Module scope rather than state: a token is a property of the tab, not of any
// component, and the callers are plain functions in api.ts.
let cached: { token: string; refreshAt: number } | null = null;

/**
 * A token, or null when there is none to be had.
 *
 * Null means "signed out" and also "the route failed" — a caller cannot do
 * anything different about the two, and what it does about both is send the
 * request without a header and let the API say whether that was allowed. With
 * the lock off that is simply correct; with it on, the 401 explains itself.
 *
 * `fresh` skips the cache. It is for the one retry after the API refused a
 * token this module believed was still good (a clock skew, a rotated secret).
 */
export async function getApiToken(
  options: { fresh?: boolean } = {},
): Promise<string | null> {
  if (!options.fresh && cached && Date.now() < cached.refreshAt) {
    return cached.token;
  }

  // Whatever happens next, the old token is not to be trusted again.
  cached = null;

  try {
    const response = await fetch(TOKEN_ROUTE);
    if (!response.ok) return null;

    const parsed = ApiToken.safeParse(await response.json());
    if (!parsed.success) return null;

    cached = {
      token: parsed.data.token,
      refreshAt: Date.now() + parsed.data.expiresIn * 1000 - REFRESH_MARGIN_MS,
    };
    return cached.token;
  } catch {
    return null;
  }
}

/** The header to merge into a request, or nothing at all. */
export async function authHeaders(
  options: { fresh?: boolean } = {},
): Promise<Record<string, string>> {
  const token = await getApiToken(options);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * For tests. Nothing calls it on sign-out: sign-out is a server action
 * (app/account/actions.ts), which cannot reach this tab's module state. A token
 * cached before signing out can therefore still be sent until it expires, at
 * most five minutes, and the API accepts it until then because it is signed,
 * not looked up. The session it was minted from is already gone.
 */
export function resetApiToken(): void {
  cached = null;
}
