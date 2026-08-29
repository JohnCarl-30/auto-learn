'use client';

import type { ApiError, ApiErrorCode } from '@auto-learn/shared';

/**
 * Refusals that are not failures.
 *
 * An over-cap paste is the product explaining its workflow, a refused burst is
 * "wait a moment", and a recording that was too long or too quiet is "say that
 * again" — none of them is the red treatment that means something broke.
 * Everything else keeps it.
 */
const GUIDANCE: Partial<Record<ApiErrorCode, string>> = {
  too_many_sentences: 'cap-notice',
  rate_limited: 'wait-notice',
  recording_too_long: 'recording-notice',
  no_speech_detected: 'silence-notice',
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
}: {
  message: string;
  tone: NoticeTone;
  testId?: string;
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
    </div>
  );
}

/** The same thing, for a refusal that arrived from the server. */
export function ApiNotice({ error }: { error: ApiError }) {
  return (
    <Notice
      message={error.message}
      tone={toneFor(error.code)}
      testId={GUIDANCE[error.code] ?? 'error-notice'}
    />
  );
}
