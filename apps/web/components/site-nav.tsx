'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountMenu } from '@/components/account-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', label: 'Write', testId: 'write-link' },
  { href: '/learn', label: 'Learn', testId: 'learn-link' },
  { href: '/talk', label: 'Talk', testId: 'talk-link' },
] as const;

/** One header for the three pages: wordmark, the tabs, and who is signed in. */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="mb-12 flex items-center justify-between gap-3 border-b pb-4 whitespace-nowrap sm:gap-4">
      <div className="flex items-center gap-4 sm:gap-8">
        <Link href="/" className="font-display text-lg tracking-tight sm:text-xl">
          auto-learn
        </Link>
        <nav aria-label="Sections" className="flex gap-4 text-sm sm:gap-5">
          {TABS.map(({ href, label, testId }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                data-testid={testId}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'underline-offset-[10px] hover:text-foreground',
                  active ? 'text-foreground underline decoration-2' : 'text-muted-foreground',
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <AccountMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}
