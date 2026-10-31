'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signInLinkFrom } from '@/lib/sign-in-link';

/**
 * Sign the installed iPhone app in with a link copied out of the email.
 *
 * A home-screen app on iOS has a cookie jar of its own, so tapping the link in
 * Mail signs Safari in and leaves the app signed out — and every call that
 * spends the key comes back 401. Pasting the link here opens it in the app's
 * own window, which is the one that needs the session cookie.
 *
 * `go` exists for tests: jsdom cannot navigate, and the navigation is the
 * whole outcome being tested.
 */
export function PasteSignInLink({
  go = (url: string) => {
    window.location.href = url;
  },
}: {
  go?: (url: string) => void;
}) {
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2"
      data-testid="paste-link-form"
      onSubmit={(event) => {
        event.preventDefault();
        const url = signInLinkFrom(link, window.location.origin);
        if (!url) {
          // Never navigated to: anything else pasted here could be a link to
          // another site, and this field must not become a way to open one.
          setError("That isn't a sign-in link from this site. Copy the link from the email and paste it here.");
          return;
        }
        setError(null);
        go(url);
      }}
    >
      <label htmlFor="sign-in-link" className="text-sm font-medium">
        Paste your sign-in link
      </label>
      <p id="sign-in-link-help" className="text-sm text-muted-foreground">
        Using the app from your iPhone Home Screen? In Mail, long-press the
        link and choose Copy Link instead of tapping it, then paste it here.
        Tapping it signs in Safari, not the app. The link works once, within
        15 minutes.
      </p>
      <div className="flex gap-2">
        <Input
          id="sign-in-link"
          // Text with a URL keyboard rather than `type="url"`: the browser's
          // own check would block the submit with its message, not ours.
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          // Not `required`, for the same reason.
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://…"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'sign-in-link-help sign-in-link-error' : 'sign-in-link-help'}
          data-testid="paste-link"
        />
        <Button type="submit" data-testid="paste-link-submit">
          Sign in
        </Button>
      </div>
      {error && (
        <p
          id="sign-in-link-error"
          role="alert"
          data-testid="paste-link-error"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </form>
  );
}
