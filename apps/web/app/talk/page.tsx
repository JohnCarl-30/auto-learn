import { TalkPanel } from '@/components/talk-panel';
import { SiteNav } from '@/components/site-nav';
import { PageHeader } from '@/components/page-header';

export const metadata = {
  title: 'Talk · auto-learn',
  description: 'Practise speaking, and learn the word that would have said it better.',
};

export default function TalkPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-16 lg:max-w-6xl">
      <SiteNav />
      <PageHeader
        eyebrow="Talk"
        title="Say it out loud, and learn the word that would have said it better."
      />
      <TalkPanel />
    </main>
  );
}
