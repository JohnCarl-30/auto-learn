'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';

/**
 * A link to the account, or an invitation to make one.
 *
 * Reads the session on the client because the page this sits in is a client
 * component all the way up — the workspace holds the draft, the proposal and
 * the open card in state, and none of that survives being moved to the server
 * for the sake of one line in the header.
 *
 * Renders nothing at all while the session is loading. The two states differ by
 * one word, and flashing "Sign in" at someone who is already signed in reads as
 * having been logged out.
 */
export function AccountMenu() {
  const { data: session, status } = useSession();

  if (status === 'loading') return null;

  return session?.user ? (
    <Link
      href="/account"
      data-testid="account-link"
      className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      Account
    </Link>
  ) : (
    <Link
      href="/signin"
      data-testid="sign-in-link"
      className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      Sign in
    </Link>
  );
}
