import type { Caller } from '@auto-learn/shared';
import { createMiddleware } from 'hono/factory';
import { CallerGuard } from './caller.guard';
import { SignedInGuard } from './signed-in.guard';

/** What a route behind `requireCaller` can read with `c.get('caller')`. */
export type CallerEnv = { Variables: { caller: Caller } };

/**
 * Opt-in per route, never global: by default every route this API has is
 * open — a writer fixes a sentence without an account, which is the product
 * working as intended. Identity applies where a route is about somebody's own
 * data. Making it global would break the product's front door.
 */
function guard(g: CallerGuard) {
  return createMiddleware<CallerEnv>(async (c, next) => {
    const request = { header: (name: string) => c.req.header(name) } as {
      header(name: string): string | undefined;
      caller?: Caller;
    };
    g.canActivate(request);
    if (request.caller) c.set('caller', request.caller);
    await next();
  });
}

/** Who is calling; 401 for anyone the web app has not vouched for. */
export const requireCaller = guard(new CallerGuard());

/** The model routes, locked only when the deploy sets `REQUIRE_SIGN_IN=true`. */
export const signedIn = guard(new SignedInGuard());
