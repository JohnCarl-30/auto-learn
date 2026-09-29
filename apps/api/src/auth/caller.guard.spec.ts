import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import {
  API_TOKEN_AUDIENCE,
  API_TOKEN_ISSUER,
  API_TOKEN_TTL_SECONDS,
} from '@auto-learn/shared';
import { CallerGuard, type RequestWithCaller } from './caller.guard';

const SECRET = 'a-test-secret-that-is-long-enough-for-hs256';
const USER = '0f2b9c1e-4a7d-4b6e-9f3a-1c8d5e2b7a40';

/**
 * Real tokens, signed with the real library.
 *
 * A stubbed verifier would let every one of these pass against a guard that
 * checked nothing — the whole value of this file is that the signature, the
 * expiry and the claims are genuinely enforced, and only a real one can show it.
 */
function token(
  overrides: {
    secret?: string;
    issuer?: string;
    audience?: string;
    subject?: string | null;
    expiresIn?: string;
    algorithm?: 'HS256' | 'HS512' | 'none';
  } = {},
): string {
  const subject = overrides.subject === undefined ? USER : overrides.subject;

  return sign({}, overrides.secret ?? SECRET, {
    algorithm: overrides.algorithm ?? 'HS256',
    issuer: overrides.issuer ?? API_TOKEN_ISSUER,
    audience: overrides.audience ?? API_TOKEN_AUDIENCE,
    expiresIn: overrides.expiresIn ?? `${API_TOKEN_TTL_SECONDS}s`,
    ...(subject === null ? {} : { subject }),
  } as Parameters<typeof sign>[2]);
}

function contextWith(authorization?: string): {
  context: ExecutionContext;
  request: RequestWithCaller;
} {
  const request = {
    header: (name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
  } as unknown as RequestWithCaller;

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('CallerGuard', () => {
  let guard: CallerGuard;

  beforeEach(() => {
    guard = new CallerGuard();
    process.env.API_JWT_SECRET = SECRET;
    // The guard logs every rejection, which is right in production and noise
    // here — most of this file is rejections.
    jest.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(guard['logger'], 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.API_JWT_SECRET;
    jest.restoreAllMocks();
  });

  it('admits a caller the web app vouched for, and says who they are', () => {
    const { context, request } = contextWith(`Bearer ${token()}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.caller).toEqual({ id: USER });
  });

  it('accepts the scheme in any casing, because clients differ', () => {
    const { context } = contextWith(`bearer ${token()}`);
    expect(guard.canActivate(context)).toBe(true);
  });

  describe('refuses', () => {
    it('a request with no authorization header', () => {
      const { context } = contextWith(undefined);
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('a header that is not a bearer token', () => {
      const { context } = contextWith(`Basic ${token()}`);
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('a bearer scheme with nothing after it', () => {
      const { context } = contextWith('Bearer   ');
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('a token signed with the wrong secret', () => {
      const { context } = contextWith(
        `Bearer ${token({ secret: 'not-the-secret-we-share-with-web' })}`,
      );
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('a token that has expired', () => {
      const { context } = contextWith(`Bearer ${token({ expiresIn: '-1s' })}`);
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    /**
     * The claims a verifier enforces only when asked. A token this same web app
     * minted for some other service is correctly signed and unexpired, and is
     * still not permission to act here.
     */
    it('a correctly signed token meant for another audience', () => {
      const { context } = contextWith(
        `Bearer ${token({ audience: 'somebody-elses-api' })}`,
      );
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('a correctly signed token from another issuer', () => {
      const { context } = contextWith(
        `Bearer ${token({ issuer: 'https://not-us.example' })}`,
      );
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('a token that names nobody', () => {
      const { context, request } = contextWith(
        `Bearer ${token({ subject: null })}`,
      );
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(request.caller).toBeUndefined();
    });

    /**
     * Algorithm confusion, which is the reason `algorithms` is pinned. A token
     * signed HS512 with the same secret verifies perfectly unless the verifier
     * insists on the algorithm it expects.
     */
    it('a token signed with an algorithm we did not choose', () => {
      const { context } = contextWith(
        `Bearer ${token({ algorithm: 'HS512' })}`,
      );
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    /**
     * A misconfigured server, not a bad caller. It has to fail closed — the
     * alternative is a deploy that forgot its secret trusting everyone — and the
     * message must not blame the person holding a perfectly good token.
     */
    it('every caller when the secret is not configured', () => {
      delete process.env.API_JWT_SECRET;
      const { context } = contextWith(`Bearer ${token()}`);

      expect(() => guard.canActivate(context)).toThrow(
        'Sign-in is not available right now.',
      );
    });
  });

  it('tells a rejected caller nothing about why', () => {
    const { context } = contextWith(
      `Bearer ${token({ audience: 'somebody-elses-api' })}`,
    );

    expect(() => guard.canActivate(context)).toThrow(
      'Sign in again to do that.',
    );
  });
});
