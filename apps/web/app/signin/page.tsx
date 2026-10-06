import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/dal';
import { SignInForm } from '@/components/sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in · auto-learn',
};

export default async function SignInPage() {
  // Nobody needs to sign in twice, and landing here with a live session is
  // usually a stale tab or a bookmarked link.
  if (await currentUser()) redirect('/account');

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Keep your words
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your bank lives in this browser. Sign in and it can follow you to
          another one.
        </p>
      </header>

      <SignInForm />

      <p className="mt-8 text-sm text-muted-foreground">
        <Link href="/" className="underline underline-offset-4">
          Back to writing
        </Link>
      </p>
    </main>
  );
}
