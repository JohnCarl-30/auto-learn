import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiError } from '@auto-learn/shared';
import { CallerGuard } from './caller.guard';

/**
 * Keeps strangers off the routes that spend the OpenAI key.
 *
 * `CallerGuard` answers "who is this?" for routes about somebody's own data.
 * This one answers a different question — "may this request spend money?" —
 * and only when the deploy asks it to. With `REQUIRE_SIGN_IN` unset every route
 * stays as open as the product intends (a writer fixes a sentence without an
 * account), so local development, the test suite and the paid blueprint behave
 * exactly as before. A public free-tier deploy sets it to `true`, and from then
 * on nothing reaches a model without a token the web app signed.
 *
 * Strictly the string `true`, not "any non-empty value": `REQUIRE_SIGN_IN=false`
 * must not read as on, and a typo must not silently lock the API.
 *
 * Every failure collapses to one `sign_in_required` body, whatever CallerGuard
 * objected to — no token, expired token, or a server missing its secret. The web
 * has a single thing to do about all of them (send the person to sign in), and
 * CallerGuard has already logged the real reason server-side.
 */
@Injectable()
export class SignedInGuard extends CallerGuard {
  override canActivate(context: ExecutionContext): boolean {
    // Read per request rather than at boot, so the lock follows the environment
    // the process is actually running in and tests can flip it.
    if (process.env.REQUIRE_SIGN_IN !== 'true') return true;

    try {
      return super.canActivate(context);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;

      throw new HttpException(
        {
          code: 'sign_in_required',
          message: 'Sign in to use auto-learn here.',
        } satisfies ApiError,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
