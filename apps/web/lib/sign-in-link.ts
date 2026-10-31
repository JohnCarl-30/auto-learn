/**
 * The sign-in link pasted into the installed app, or null if it is not one.
 *
 * Why pasting exists at all: an iPhone home-screen app keeps its own cookies,
 * apart from Safari's. Tapping the emailed link opens Safari, so Safari gets
 * signed in and the app stays signed out. Pasting the link into the app makes
 * the app's own window redeem the token, into the app's own cookie jar.
 *
 * Whatever is accepted here is navigated to, so this is a trust boundary: only
 * an Auth.js callback on this very site gets through. Another origin would make
 * the field an open redirect (and a `javascript:` URL a script); another path
 * here would be a navigation nobody meant to paste.
 *
 * `URL` resolves `..` and `%2e%2e` segments before `pathname` is read, so a
 * path that walks back out of the callback directory is caught by the prefix
 * check rather than slipping past it.
 */
export function signInLinkFrom(input: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (!url.pathname.startsWith('/api/auth/callback/')) return null;
  return url.href;
}
