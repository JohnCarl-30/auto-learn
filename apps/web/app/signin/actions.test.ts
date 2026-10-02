jest.mock('@/auth', () => ({ signIn: jest.fn() }));
jest.mock('next-auth', () => {
  class AuthError extends Error {}
  return { AuthError };
});
jest.mock('next/navigation', () => ({
  redirect: jest.fn((to: string) => {
    // Real `redirect` throws so nothing after it runs. The tests depend on that
    // — the action calls it outside its try block precisely because it throws.
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { requestLink } from './actions';

const sends = signIn as jest.Mock;

const submit = (email: string) => {
  const form = new FormData();
  form.set('email', email);
  return requestLink({}, form);
};

describe('requestLink', () => {
  beforeEach(() => {
    sends.mockReset();
    sends.mockResolvedValue(undefined);
  });

  it('asks for a link and sends the writer to check their email', async () => {
    await expect(submit('writer@school.edu')).rejects.toThrow(
      'NEXT_REDIRECT:/signin/sent?email=writer%40school.edu',
    );

    expect(sends).toHaveBeenCalledWith('resend', {
      email: 'writer@school.edu',
      redirect: false,
    });
  });

  it('trims what was typed, because a copied address often carries a space', async () => {
    await expect(submit('  writer@school.edu  ')).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(sends).toHaveBeenCalledWith('resend', {
      email: 'writer@school.edu',
      redirect: false,
    });
  });

  /**
   * The form's `type="email"` means a browser will not submit this, so the only
   * way to arrive here is a hand-made request. It still has to be refused: the
   * address is about to be handed to a mail provider.
   */
  describe('refuses an address that is not one', () => {
    it.each(['', '   ', 'nope', 'writer@', '@school.edu', 'writer @ school.edu'])(
      '%p',
      async (bad) => {
        await expect(submit(bad)).resolves.toEqual({
          error: "That doesn't look like an email address.",
          email: bad.trim(),
        });
        expect(sends).not.toHaveBeenCalled();
      },
    );
  });

  it('reports a refused send without blaming the writer', async () => {
    sends.mockRejectedValue(new AuthError('resend said no'));

    await expect(submit('writer@school.edu')).resolves.toEqual({
      error: "Couldn't send that link. Try again in a moment.",
      email: 'writer@school.edu',
    });
  });

  /**
   * A database that is not there, most likely. Different message, same shape:
   * nothing here is the writer's fault and nothing here is theirs to fix.
   */
  it('reports a failure that is not the provider as our own', async () => {
    sends.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(submit('writer@school.edu')).resolves.toEqual({
      error: 'Something went wrong on our side. Try again in a moment.',
      email: 'writer@school.edu',
    });
  });
});
