import Link from 'next/link';
import { AccountMenu } from '@/components/account-menu';
import { LessonPanel } from '@/components/lesson-panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { currentUser } from '@/lib/dal';

export const metadata = {
  title: 'Learn · auto-learn',
  description: 'A short daily lesson: review your words, meet a new one, and answer out loud.',
};

/**
 * Lessons need an account: the streak and the review schedule live in Postgres
 * so phone and laptop agree. Signed out, the page says so and stops, rather than
 * opening a lesson whose first request would be refused.
 */
export default async function LearnPage() {
  const user = await currentUser();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-16">
      <header className="mb-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link href="/" className="hover:underline">
              auto-learn
            </Link>{' '}
            <span className="text-muted-foreground">· Learn</span>
          </h1>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Write
            </Link>
            <Link href="/talk" className="text-sm text-muted-foreground hover:text-foreground">
              Talk
            </Link>
            {/* The installed app opens here, so this is where signing in has to be. */}
            <AccountMenu />
            <ThemeToggle />
          </div>
        </div>
        <p className="mt-1 text-muted-foreground">
          Five minutes a day: your words, a new one, and an answer out loud.
        </p>
      </header>
      {user ? (
        <LessonPanel />
      ) : (
        <p data-testid="learn-signed-out">
          Lessons keep your streak and reviews in your account.{' '}
          <Link href="/signin" className="font-medium underline">
            Sign in to start
          </Link>
        </p>
      )}
    </main>
  );
}
