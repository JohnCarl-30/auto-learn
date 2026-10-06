import { handlers } from '@/auth';

/**
 * The sign-in endpoints Auth.js serves: the callback a magic link lands on, the
 * session lookup the browser makes, and the CSRF token behind both.
 *
 * Everything else about auth lives in `auth.ts`; this file exists because the
 * App Router needs a route to hang it on.
 */
export const { GET, POST } = handlers;
