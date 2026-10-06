jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { auth } from '@/auth';
import { redirect } from 'next/navigation';

const session = auth as unknown as jest.Mock;
const goes = redirect as unknown as jest.Mock;

import { currentUser, requireUser } from './dal';

/**
 * `currentUser` is wrapped in React's `cache`, which memoizes for the life of a
 * request. There is no request here, and outside one `cache` calls straight
 * through — which is what lets these cases share an import and still each see
 * their own session. If that ever changes, this file fails loudly rather than
 * subtly: every test after the first would get the first one's answer.
 */

describe('currentUser', () => {
  beforeEach(() => {
    session.mockReset();
    goes.mockClear();
  });

  it('reports the signed-in writer', async () => {
    session.mockResolvedValue({
      user: { id: 'u-1', email: 'writer@school.edu' },
    });

    await expect(currentUser()).resolves.toEqual({
      id: 'u-1',
      email: 'writer@school.edu',
    });
  });

  it('reports nobody when there is no session', async () => {
    session.mockResolvedValue(null);

    await expect(currentUser()).resolves.toBeNull();
  });

  /**
   * A session carrying half a user is the interesting case. It should not become
   * a `CurrentUser` with an undefined field that something downstream renders or
   * keys a database row by — treated as signed out instead.
   */
  it('reports nobody for a session with an id but no email', async () => {
    session.mockResolvedValue({ user: { id: 'u-1' } });

    await expect(currentUser()).resolves.toBeNull();
  });

  it('reports nobody for a session with an email but no id', async () => {
    session.mockResolvedValue({ user: { email: 'writer@school.edu' } });

    await expect(currentUser()).resolves.toBeNull();
  });
});

describe('requireUser', () => {
  beforeEach(() => {
    session.mockReset();
    goes.mockClear();
  });

  it('returns the writer when there is one', async () => {
    session.mockResolvedValue({
      user: { id: 'u-1', email: 'writer@school.edu' },
    });

    await expect(requireUser()).resolves.toEqual({
      id: 'u-1',
      email: 'writer@school.edu',
    });
    expect(goes).not.toHaveBeenCalled();
  });

  /**
   * It has to throw rather than return, which is what makes it safe as the first
   * line of a page: there must be no path where the rest of the component runs
   * for a stranger because someone forgot to check the return value.
   */
  it('sends a stranger to sign in, and does not return', async () => {
    session.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(goes).toHaveBeenCalledWith('/signin');
  });
});
