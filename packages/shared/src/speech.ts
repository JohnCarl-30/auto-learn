import { z } from 'zod';

/**
 * How a word sounds, retrieved rather than generated.
 *
 * Both fields come free with the dictionary lookup the card already makes —
 * Free Dictionary returns them alongside the senses, and until now we threw
 * them away. `audioUrl` is a recording someone contributed to Wikimedia; `ipa`
 * is the written pronunciation, which exists for far more words than the
 * recordings do.
 *
 * A null `audioUrl` is not a dead end: every word can be synthesised on demand
 * through /speak. It means "nobody recorded this one", not "this one is silent".
 */
export const Pronunciation = z.object({
  ipa: z.string().nullable(),
  audioUrl: z.string().nullable(),
});
export type Pronunciation = z.infer<typeof Pronunciation>;

/**
 * What /speak will pronounce.
 *
 * The endpoint is unauthenticated and spends a provider key, so left open it is
 * a free text-to-speech proxy for anyone who finds it. A rate limit alone only
 * bounds how *often* someone can abuse it, not how expensively — one request
 * could carry an essay. Constraining the input to a single word caps the cost
 * of any single call at a couple of tokens, which is what actually makes the
 * route safe to expose.
 *
 * The parameter is named `word` rather than `text` for the same reason: the
 * name is what stops the next person widening this to "just the sentence".
 */
export const SpeakWord = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[\p{L}\p{M}'’-]+$/u, 'Ask for a single word.');
export type SpeakWord = z.infer<typeof SpeakWord>;

export const SpeakResponse = z.object({
  word: z.string(),
  /** base64. The client turns this into a `data:` URL and plays it. */
  audio: z.string(),
  /**
   * Not pinned to a literal on purpose. The client only interpolates it into a
   * data URL, so a provider changing its default container should not be a
   * contract break the browser reports as "something unexpected".
   */
  mediaType: z.string(),
});
export type SpeakResponse = z.infer<typeof SpeakResponse>;

/**
 * What we accept from a microphone.
 *
 * Shared because two very distant places need to agree on it: the browser picks
 * its recording container by asking `MediaRecorder.isTypeSupported` about this
 * list, and the server rejects uploads against the same one. Drift between them
 * shows up as a recording that uploads fine and is refused on arrival.
 */
export const AUDIO_MEDIA_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
] as const;

/**
 * MediaRecorder reports what it produced as `audio/webm;codecs=opus`, not
 * `audio/webm` — the codec parameter is part of the value. Comparing the raw
 * string against the list above rejects every real recording Chrome makes,
 * which is a bug that only appears once a browser is involved.
 */
export function isAudioMediaType(value: string | undefined): boolean {
  if (!value) return false;
  const base = value.split(';')[0].trim().toLowerCase();
  return (AUDIO_MEDIA_TYPES as readonly string[]).includes(base);
}
