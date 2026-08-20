'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

/**
 * Overrides the OS preference, which is the default.
 *
 * Which icon shows is decided by CSS, off the same `dark` class the palette
 * hangs off — so there is no mount guard, nothing to hydrate, and no flash of
 * the wrong glyph. The name stays fixed for the same reason: a label that
 * depended on the resolved theme would differ between server and client.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid="theme-toggle"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <MoonIcon className="size-4 dark:hidden" />
      <SunIcon className="hidden size-4 dark:block" />
    </Button>
  );
}
