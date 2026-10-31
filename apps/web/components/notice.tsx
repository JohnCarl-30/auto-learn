'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ApiError, ApiErrorCode } from '@auto-learn/shared';

/**
 * Refusals that are not failures.
 *
 * An over-cap paste is the product explaining its workflow, a refused burst is
 * "wait a moment", a recording that was too long or too quiet is "say that
 * again", and a locked site asking for a sign-in is "go and do that" — none of
 * them is the red treatment that means something broke. Everything else keeps it.
 */
const GUIDANCE: Partial<Record<ApiErrorCode, string>> = {
  too_many_sentences: 'cap-notice',
  rate_limited: 'wait-notice',
  recording_too_long: 'recording-notice',
  no_speech_detected: 'silence-notice',
  sign_in_required: 'signin-notice',
};

export type NoticeTone = 'guidance' | 'error';

export function toneFor(code: ApiErrorCode): NoticeTone {
  return code in GUIDANCE ? 'guidance' : 'error';
}

/**
 * Lives here rather than in the page because the microphone is in the compose
 * panel and needs the same vocabulary. Duplicating it would be how the two
 * halves of the app start disagreeing about which failures are the reader's
 * fault.
 */
export function Notice({
  message,
  tone,
  testId,
  children,
}: {
  message: string;
  tone: NoticeTone;
  testId?: string;
  /** Anything the reader can do about it, shown after the message. */
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      data-testid={testId ?? (tone === 'guidance' ? 'guidance-notice' : 'error-notice')}
      className={
        tone === 'guidance'
          ? 'rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm'
          : 'rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'
      }
    >
      {message}
      {children}
    </div>
  );
}

/**
 * The same thing, for a refusal that arrived from the server.
 *
 * `testId` is for a panel that shows more than one of these at once (the talk
 * panel's turn and its microphone) and needs to tell them apart.
 */
export function ApiNotice({ error, testId }: { error: ApiError; testId?: string }) {
  return (
    <Notice
      message={error.message}
      tone={toneFor(error.code)}
      testId={testId ?? GUIDANCE[error.code] ?? 'error-notice'}
    >
      {/* The one refusal with a next step that is a page, not a retry. */}
      {error.code === 'sign_in_required' && (
        <>
          {' '}
          <Link href="/signin" className="font-medium underline">
            Sign in
          </Link>
        </>
      )}
    </Notice>
  );
}
