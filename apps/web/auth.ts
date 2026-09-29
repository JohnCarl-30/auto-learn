import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';
import PostgresAdapter from '@auth/pg-adapter';
import { lazyPool } from '@/lib/db';
import { signInEmail } from '@/lib/sign-in-email';

/**
 * Sign-in, so a word bank can belong to someone rather than to a browser.
 *
 * Magic links only, and that is the whole of it: no passwords to choose, forget,
 * reuse or store, and no third party holding the user table. The people this is
 * for are students on shared and borrowed machines, where "stay signed in on my
 * laptop" is the wrong shape and a password is one more thing to lose.
 *
 * Database sessions rather than a JWT, which is the Auth.js default once an
 * adapter is present and the right default here: signing out on a library
 * computer has to actually end the session, and a stateless token cannot be
 * revoked before it expires.
 *
 * Note on versions: next-auth v5 is still published under the `beta` tag. It is
 * what the current documentation describes and what the App Router is designed
 * around — v4's App Router support works but predates it, and its email
 * provider needs nodemailer where v5 talks to Resend over fetch. The label is
 * real and worth knowing; the alternative was worse.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PostgresAdapter(lazyPool()),

  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? 'auto-learn <onboarding@resend.dev>',
      /**
       * Fifteen minutes, against a default of twenty-four hours.
       *
       * This link is a bearer credential sent in cleartext to an inbox, and a
       * day is a long time for one to sit in a mailbox someone else can reach.
       * Long enough to switch to the mail app and back; short enough that a
       * forwarded or over-the-shoulder link is usually already dead.
       */
      maxAge: 15 * 60,
      sendVerificationRequest: signInEmail,
    }),
  ],

  // Ours, so the sign-in page looks like the product rather than like Auth.js.
  pages: {
    signIn: '/signin',
    verifyRequest: '/signin/sent',
    error: '/signin',
  },

  session: {
    // Thirty days, refreshed a day at a time. Long enough that a writer who
    // comes back each week is not signing in each week.
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  callbacks: {
    /**
     * Builds the session the browser is allowed to see, field by field.
     *
     * Adding the user id is the reason this exists — the default omits it, and it
     * is what a synced bank will be keyed by and what the API is told when it
     * asks who is calling.
     *
     * Constructed rather than spread, which is not a style choice. With database
     * sessions the object handed to this callback is the session row itself, so
     * returning it — or spreading it — publishes `sessionToken` at
     * /api/auth/session, where any script on the page can read it. That token is
     * the session: the cookie carrying it is httpOnly precisely so that a script
     * cannot, and handing it back as JSON gives away the protection. Verified by
     * curl before and after this was narrowed.
     */
    session({ session, user }) {
      return {
        expires: session.expires,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        },
      };
    },
  },
});
