'use client';

import type { Pronunciation, SpeakResponse } from '@auto-learn/shared';

/**
 * Audio arrives two ways — a URL the dictionary already had, or bytes we paid
 * to synthesise — and the component that plays it should not care which. Both
 * become a `src` string here, so there is one player and two producers rather
 * than two of each.
 */
export function synthesisedSrc(response: SpeakResponse): string {
  return `data:${response.mediaType};base64,${response.audio}`;
}

export function recordedSrc(pronunciation: Pronunciation): string | null {
  return pronunciation.audioUrl;
}

/**
 * Thin on purpose. It exists as a seam: jsdom implements no media playback at
 * all, so a component test can replace this rather than fight `HTMLMediaElement`.
 */
export async function playAudio(src: string): Promise<void> {
  await new Audio(src).play();
}
