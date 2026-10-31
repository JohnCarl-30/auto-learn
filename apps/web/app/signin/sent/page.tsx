import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { PasteSignInLink } from '@/components/paste-sign-in-link';

export const metadata: Metadata = {
  title: 'Check your email · auto-learn',
};

/**
 * The address is parsed rather than printed.
 *
 * It arrives in a query string, which anyone can write, and it is rendered back
 * onto the page. React escapes it, so this is not about injection — it is that
 * a link to `/signin/sent?email=<a sentence>` would otherwise render that
 * sentence inside a sentence of ours that says we sent them something.
 */
export default async function SentPage({
  searchParams,
}: PageProps<'/signin/sent'>) {
  const { email } = await searchParams;
  const parsed = z.email().safeParse(email);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Check your email
      </h1>
      <p className="mt-2 text-muted-foreground">
        {parsed.success ? (
          <>
            A sign-in link is on its way to{' '}
            <span className="font-medium text-foreground">{parsed.data}</span>.
          </>
        ) : (
          <>A sign-in link is on its way.</>
        )}{' '}
        It works once and expires in 15 minutes.
      </p>
      {/*
        For the installed iPhone app, whose cookies are its own: a tapped link
        signs in Safari instead. Shown to everyone, because this page cannot
        tell an installed app from a tab, and on a laptop it is simply unused.
      */}
      <div className="mt-8">
        <PasteSignInLink />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Nothing arrived?{' '}
        <Link href="/signin" className="underline underline-offset-4">
          Try a different address
        </Link>
        .
      </p>
    </main>
  );
}
