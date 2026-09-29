'use server';

import { signOut } from '@/auth';

/**
 * Ends the session and goes home.
 *
 * A server action rather than the client `signOut` helper, because this has to
 * work on a form submit with no JavaScript: the machines this is used on are
 * often school-managed, and signing out is the one action that must not depend
 * on a script having loaded. `signOut` deletes the row as well as the cookie —
 * with database sessions there is nothing left to replay afterwards.
 */
export async function endSession(): Promise<void> {
  await signOut({ redirectTo: '/' });
}
