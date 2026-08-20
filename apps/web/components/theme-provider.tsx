'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * next-themes has to run on the client, and the layout is a server component —
 * hence this one-line boundary rather than importing the provider directly.
 *
 * `globals.css` has carried a full `.dark` palette since the app was
 * scaffolded, and nothing ever put that class on the document, so every one of
 * those tokens was unreachable. This is what switches them on.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemeProvider>) {
  return <NextThemeProvider {...props}>{children}</NextThemeProvider>;
}
