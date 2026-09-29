'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

const Email = z.email();

export interface SignInState {
  error?: string;
  /** Echoed back so a rejected form does not also lose what was typed. */
  email?: string;
}

/**
 * Asks for a sign-in link.
 *
 * Validated here rather than relying on the browser: `type="email"` is a
 * convenience that a fetch does not have to honour, and the address is about to
 * be handed to a mail provider.
 *
 * `redirect: false` is what makes this readable. Auth.js would otherwise throw
 * a redirect from inside the call, which is indistinguishable from a real
 * failure without reaching for a Next.js internal to tell them apart; asking
 * for the URL instead leaves the two outcomes as a return and a throw.
 */
export async function requestLink(
  _previous: SignInState,
  form: FormData,
): Promise<SignInState> {
  const raw = form.get('email');
  const email = typeof raw === 'string' ? raw.trim() : '';
  const parsed = Email.safeParse(email);

  if (!parsed.success) {
    return { error: "That doesn't look like an email address.", email };
  }

  try {
    await signIn('resend', { email: parsed.data, redirect: false });
  } catch (error) {
    // Anything from the provider — a refused send, an unverified domain, a
    // database that is not there. The reason goes to the server log; the person
    // gets something true and actionable, because none of those are their fault
    // and none are theirs to fix.
    console.error('sign-in link failed', error);
    return {
      error:
        error instanceof AuthError
          ? "Couldn't send that link. Try again in a moment."
          : "Something went wrong on our side. Try again in a moment.",
      email,
    };
  }

  // Outside the try: a redirect is implemented as a throw, and catching our own
  // navigation would turn a success into that error message.
  redirect(`/signin/sent?email=${encodeURIComponent(parsed.data)}`);
}
