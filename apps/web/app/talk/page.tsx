import Link from 'next/link';
import { TalkPanel } from '@/components/talk-panel';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata = {
  title: 'Talk · auto-learn',
  description: 'Practise speaking, and learn the word that would have said it better.',
};

export default function TalkPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <header className="mb-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link href="/" className="hover:underline">
              auto-learn
            </Link>{' '}
            <span className="text-muted-foreground">· Talk</span>
          </h1>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Write
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <p className="mt-1 text-muted-foreground">
          Say it out loud, and learn the word that would have said it better.
        </p>
      </header>
      <TalkPanel />
    </main>
  );
}
