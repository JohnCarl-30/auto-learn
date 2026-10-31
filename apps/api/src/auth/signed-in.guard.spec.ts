import { ExecutionContext, HttpException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { API_TOKEN_AUDIENCE, API_TOKEN_ISSUER } from '@auto-learn/shared';
import type { RequestWithCaller } from './caller.guard';
import { SignedInGuard, signInRequired } from './signed-in.guard';

const SECRET = 's';

/** The refusal every failure must collapse to, so the web has one thing to handle. */
const SIGN_IN_REQUIRED = {
  code: 'sign_in_required',
  message: 'Sign in to use auto-learn here.',
};

/** Real tokens, signed with the real library — same reasoning as caller.guard.spec.ts. */
function token(expiresIn?: number): string {
  return sign({}, SECRET, {
    algorithm: 'HS256',
    subject: 'u1',
    issuer: API_TOKEN_ISSUER,
    audience: API_TOKEN_AUDIENCE,
    ...(expiresIn === undefined ? {} : { expiresIn }),
  });
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

/** Runs the guard and hands back what it threw, failing the test if it did not. */
function refusal(
  guard: SignedInGuard,
  context: ExecutionContext,
): HttpException {
  try {
    guard.canActivate(context);
  } catch (error) {
    return error as HttpException;
  }
  throw new Error(
    'expected the guard to refuse, but it let the request through',
  );
}

describe('signInRequired', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
  });

  afterEach(() => {
    process.env = original;
  });

  /**
   * Only the exact string turns the lock on. The ruled trade-off is that a typo
   * leaves the API open rather than guessing what was meant, which is why
   * main.ts warns about any other non-empty value.
   */
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['TRUE', false],
    ['1', false],
    ['true', true],
  ])('reads REQUIRE_SIGN_IN=%j as %s', (value, expected) => {
    if (value === undefined) delete process.env.REQUIRE_SIGN_IN;
    else process.env.REQUIRE_SIGN_IN = value;

    expect(signInRequired()).toBe(expected);
  });
});

describe('SignedInGuard', () => {
  const original = process.env;
  let guard: SignedInGuard;

  beforeEach(() => {
    process.env = { ...original };
    guard = new SignedInGuard();
    // Rejections are logged by CallerGuard, which is right in production and
    // noise here.
    jest.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(guard['logger'], 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = original;
    jest.restoreAllMocks();
  });

  it('lets every request through when REQUIRE_SIGN_IN is unset', () => {
    delete process.env.REQUIRE_SIGN_IN;
    const { context, request } = contextWith(undefined);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.caller).toBeUndefined();
  });

  describe('when the lock is on', () => {
    beforeEach(() => {
      process.env.REQUIRE_SIGN_IN = 'true';
      process.env.API_JWT_SECRET = SECRET;
    });

    it('refuses a request with no token', () => {
      const error = refusal(guard, contextWith(undefined).context);

      expect(error.getResponse()).toEqual(SIGN_IN_REQUIRED);
      expect(error.getStatus()).toBe(401);
    });

    it('accepts a valid token and records the caller', () => {
      const { context, request } = contextWith(`Bearer ${token()}`);

      expect(guard.canActivate(context)).toBe(true);
      expect(request.caller).toEqual({ id: 'u1' });
    });

    it('refuses an expired token with sign_in_required', () => {
      const error = refusal(guard, contextWith(`Bearer ${token(-1)}`).context);

      expect(error.getResponse()).toEqual(SIGN_IN_REQUIRED);
      expect(error.getStatus()).toBe(401);
    });
  });
});
