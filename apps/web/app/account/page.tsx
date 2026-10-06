import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { requireUser } from '@/lib/dal';
import { BankSummary } from '@/components/bank-summary';
import { endSession } from './actions';

export const metadata: Metadata = {
  title: 'Account · auto-learn',
};

export default async function AccountPage() {
  // First line of the component, and the only guard this page needs: it throws
  // a redirect, so there is no path where anything below renders for a stranger.
  const user = await requireUser();

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-2 text-muted-foreground">
          Signed in as{' '}
          <span className="font-medium text-foreground">{user.email}</span>
        </p>
      </header>

      <Separator />

      <section className="py-8">
        <h2 className="text-sm font-medium">Your words</h2>
        <BankSummary />
      </section>

      <Separator />

      <div className="flex items-center justify-between pt-8">
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to writing
        </Link>
        <form action={endSession}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
