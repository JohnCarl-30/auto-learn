import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * Who is calling, or nobody.
 *
 * Wrapped in React's `cache` so a page, its layout and anything either of them
 * renders resolve the session once per request rather than once per caller.
 * Everything server-side that needs an identity goes through here, so there is
 * one place that decides what a session means and one shape for the answer —
 * the Next.js docs call this a data access layer, and the reason to have one is
 * that the alternative is an `auth()` call in every component, each free to
 * forget a check.
 *
 * Returns only id and email. The session also carries name and image, which are
 * always null here because a magic link asks for neither, and returning them
 * would invite a component to render an avatar that will never exist.
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const user = session?.user;

  // An id without an email, or the reverse, is not a user we can show anything
  // about. Treated as signed out rather than partially trusted.
  if (!user?.id || !user.email) return null;

  return { id: user.id, email: user.email };
});

/**
 * The same, for pages that have nothing to show a stranger.
 *
 * `redirect` throws, which is what makes this safe to put at the top of a
 * component: there is no path where the rest of the component runs without a
 * user, so a forgotten early return cannot leak anything.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect('/signin');
  return user;
}
