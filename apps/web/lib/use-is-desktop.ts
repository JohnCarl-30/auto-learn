import { useSyncExternalStore } from 'react';

/** Tailwind's `lg`, where a page gains its second column. */
const QUERY = '(min-width: 1024px)';

/**
 * Whether the page is wide enough for two columns. For the one case CSS cannot
 * do: a component that must be mounted once and sits in a different place on a
 * desktop. False on the server and in jsdom, so the phone layout is the default.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(QUERY);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
