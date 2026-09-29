import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { verify } from 'jsonwebtoken';
import {
  API_TOKEN_AUDIENCE,
  API_TOKEN_ISSUER,
  type Caller,
} from '@auto-learn/shared';

/** What a guarded handler can read off the request once this has run. */
export interface RequestWithCaller extends Request {
  caller?: Caller;
}

/**
 * Decides who is calling, by verifying a token the web app signed.
 *
 * This API has no user table, no session store and no way to authenticate
 * anyone by itself — deliberately, because it is the half that talks to models
 * and the half that should not hold people's credentials. It trusts one thing:
 * a five-minute assertion signed with a secret only the web app shares, saying
 * "this request is user X".
 *
 * Everything that can be checked is checked. Signature, expiry, issuer,
 * audience and a non-empty subject — the middle two because a correctly signed
 * token minted for something else is still not permission to act here, and a
 * verifier enforces no claim it is not asked about.
 *
 * `jsonwebtoken` rather than `jose`, which the web half uses. jose is ESM-only,
 * and this service compiles to CommonJS: `require` of an ES module works from
 * Node 20.19 and 22.12, and this repository's engines field admits 20.3. That
 * range is the difference between a deploy that boots and one that does not, and
 * a second small library is a cheaper answer than raising the floor for everyone
 * over one import.
 */
@Injectable()
export class CallerGuard implements CanActivate {
  private readonly logger = new Logger(CallerGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithCaller>();
    const token = bearer(request.header('authorization'));

    if (!token) throw new UnauthorizedException('Sign in to do that.');

    const secret = process.env.API_JWT_SECRET;
    if (!secret) {
      // A missing secret is our fault, not the caller's, and it must never read
      // as "your token is bad" — that sends someone to sign in again forever.
      this.logger.error('API_JWT_SECRET is not set; no caller can be trusted.');
      throw new UnauthorizedException('Sign-in is not available right now.');
    }

    try {
      const payload = verify(token, secret, {
        issuer: API_TOKEN_ISSUER,
        audience: API_TOKEN_AUDIENCE,
        // Pinned rather than inferred. Without this, a verifier accepts
        // whatever algorithm the token's own header names, which is how a
        // token gets to choose a weaker one than the server intended — or
        // "none" at all.
        algorithms: ['HS256'],
      });

      // A token whose payload is a bare string carries no claims to read.
      if (typeof payload === 'string' || !payload.sub) {
        throw new Error('token carries no subject');
      }

      request.caller = { id: payload.sub };
      return true;
    } catch (error) {
      // Expired, tampered with, for another audience, or signed with a secret
      // that has since rotated. The reason is logged and not returned: telling
      // a caller which part of their token failed helps them forge a better one.
      this.logger.warn(
        `rejected a caller: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new UnauthorizedException('Sign in again to do that.');
    }
  }
}

/**
 * Strict about the scheme, and case-insensitive about it.
 *
 * "Bearer" is what the spec says and what every client sends; the casing is not
 * guaranteed. A header that is present but malformed returns null and becomes a
 * 401, rather than being passed to the verifier as a token.
 */
function bearer(header: string | undefined): string | null {
  if (!header) return null;

  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;

  const token = rest.join(' ').trim();
  return token.length > 0 ? token : null;
}
