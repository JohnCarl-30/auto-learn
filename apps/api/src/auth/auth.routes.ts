import { Hono } from 'hono';
import { rateLimit } from '../common/rate-limit';
import { requireCaller, type CallerEnv } from './auth.middleware';

/**
 * Who the API thinks is calling.
 *
 * Small on purpose, and not a placeholder: it is the only route that proves
 * the whole chain — session cookie, minted token, verified signature — works
 * end to end, and it is what the client will call to find out whether its
 * token is still good before it tries to sync anything.
 *
 * It returns the id the token asserted rather than anything looked up, because
 * there is nothing to look up: this service has no user table, and that is the
 * design rather than a gap in it.
 */
export const authRoutes = new Hono<CallerEnv>().get(
  '/',
  rateLimit('default'),
  requireCaller,
  (c) => c.json(c.get('caller')),
);
