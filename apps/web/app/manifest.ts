import type { MetadataRoute } from 'next';

// shortcut: no service worker, so nothing works offline; add one if offline practice is ever wanted.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'auto-learn',
    short_name: 'auto-learn',
    // Installing is for the daily habit: the app opens on today's lesson.
    start_url: '/learn',
    display: 'standalone',
    // The light theme in globals.css: --background (white) behind the splash,
    // --primary (near-black) for the browser chrome and the icon's ground.
    background_color: '#ffffff',
    theme_color: '#171717',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
