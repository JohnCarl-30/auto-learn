import { z } from 'zod';

export const DictateResponse = z.object({
  transcript: z.string(),
});
export type DictateResponse = z.infer<typeof DictateResponse>;

/**
 * The recording caps, and which end enforces which.
 *
 * Seconds are what a person understands and what the message says, but the
 * server cannot see duration without decoding the audio — it can only see
 * bytes. So the browser stops the recorder at the time limit, and the server
 * refuses on size. The two are not the same check, and pretending the client
 * cap is the enforcement is how you end up with neither.
 *
 * The byte limit is deliberately loose rather than the ~180KB that 60 seconds
 * at our chosen bitrate produces. Browsers do not all honour
 * `audioBitsPerSecond`, and a tight limit would turn "Safari picked a different
 * bitrate" into an unexplainable failure. Its job is bounding memory, and 1MB
 * is roughly 60 seconds even at the worst bitrate a browser will realistically
 * choose.
 */
export const MAX_RECORDING_SECONDS = 60;
export const MAX_RECORDING_BYTES = 1024 * 1024;

/**
 * Set explicitly because the default is not what you would guess: Chrome picks
 * roughly 48kbps for audio-only Opus, twice what speech needs. Leaving it unset
 * doubles every upload for no gain in transcription accuracy.
 */
export const RECORDING_BITS_PER_SECOND = 24_000;

/**
 * Adds dictated words to whatever is already in the box.
 *
 * Appending rather than replacing, because the escape hatch people assume
 * exists does not: setting a controlled textarea's value from code does not
 * push a browser undo entry, so "they can just press Cmd-Z" is false. Replacing
 * would destroy typed work with no way back — the same loss the draft in
 * use-review is hoisted specifically to prevent, except on the success path.
 *
 * Never invents punctuation. If someone stopped mid-sentence and dictated the
 * rest, a full stop we added is a word they did not say.
 */
export function joinDictation(existing: string, transcript: string): string {
  const spoken = transcript.trim();
  if (!spoken) return existing;
  if (!existing) return spoken;
  return /\s$/.test(existing) ? `${existing}${spoken}` : `${existing} ${spoken}`;
}
