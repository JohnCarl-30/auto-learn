import Link from 'next/link';
import { LessonPanel } from '@/components/lesson-panel';
import { SiteNav } from '@/components/site-nav';
import { PageHeader } from '@/components/page-header';
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
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-16 lg:max-w-6xl">
      <SiteNav />
      {/* A lesson names its own unit in the header, so it draws the header itself. */}
      {user ? (
        <LessonPanel />
      ) : (
        <>
          <PageHeader
            eyebrow="Learn"
            title="Five minutes a day: your words, a new one, and an answer out loud."
          />
          <p data-testid="learn-signed-out">
          Lessons keep your streak and reviews in your account.{' '}
          <Link href="/signin" className="font-medium underline">
            Sign in to start
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
