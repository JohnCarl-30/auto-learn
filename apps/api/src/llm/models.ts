import { elevenLabs } from '@ai-sdk/elevenlabs';
import { openai } from '@ai-sdk/openai';

/**
 * Four model calls, two of them text and two of them audio.
 *
 * The text pair have opposite priorities.
 *
 * PROPOSE runs on every submission with the user watching a spinner, so it
 * takes the cheap model with reasoning off. CARD fires only after the user has
 * committed by opening a gate, so it can afford to think — and it is the
 * artifact the product exists to deliver, where a wrong nuance claim teaches a
 * learner something false.
 *
 * Prices per 1M tokens at time of writing: luna $1/$6, terra $2.50/$15.
 * Cached input is 90% off, which is why the system prompts below are constants
 * and never interpolate per-request values.
 */
export const PROPOSE_MODEL = 'gpt-5.6-luna';
export const CARD_MODEL = 'gpt-5.6-terra';

export const proposeModel = () => openai(PROPOSE_MODEL);
export const cardModel = () => openai(CARD_MODEL);

/**
 * `promptCacheKey` groups requests that share a prefix so the provider can
 * serve the stable system prompt from cache. Distinct keys per call type
 * because the two prompts differ.
 */
export const proposeProviderOptions = {
  openai: {
    reasoningEffort: 'none',
    promptCacheKey: 'auto-learn:propose:v1',
  },
} as const;

export const cardProviderOptions = {
  openai: {
    reasoningEffort: 'low',
    promptCacheKey: 'auto-learn:card:v1',
  },
} as const;

// --- Voice ------------------------------------------------------------------
// A different provider, and deliberately so: OpenAI is where the reasoning
// happens, ElevenLabs is where the speaking happens. Both go through the same
// AI SDK functions, so the vendor is these constants rather than an
// architecture — swapping back is this file and nothing else.

/**
 * Transcription sits where PROPOSE sits: someone is watching a spinner while
 * their own speech turns into text, so it takes the fast tier.
 */
export const TRANSCRIBE_MODEL = 'scribe_v2';

/**
 * Speech does not: it fires on a click, for a single word, and the result is
 * cached for a week afterwards. The quality tier costs almost nothing at that
 * scale, and a mispronounced word teaches a learner something false — the same
 * reason CARD is allowed to think.
 */
export const SPEECH_MODEL = 'eleven_v3';

export const transcribeModel = () => elevenLabs.transcription(TRANSCRIBE_MODEL);
export const speechModel = () => elevenLabs.speech(SPEECH_MODEL);

/**
 * From the environment rather than a constant, because a voice id is
 * account-scoped rather than universal: ElevenLabs' shared Default voices are
 * withdrawn at the end of 2026 and are unavailable to newer accounts already,
 * so a hardcoded id is a deployment that stops working on a date nobody
 * remembers choosing.
 */
export const speechVoice = () => process.env.ELEVENLABS_VOICE_ID ?? '';

export const transcribeProviderOptions = {
  elevenlabs: {
    /**
     * The important one. Left to auto-detect, a strongly accented English
     * utterance can be identified as another language and come back
     * *translated* rather than transcribed — silently, and worst for exactly
     * the learners this product is for.
     */
    languageCode: 'en',
    /**
     * Off, or the transcript arrives with "[laughter]" and "[background
     * noise]" in it — annotations that are useful for captioning and are
     * vandalism inside someone's draft sentence.
     */
    tagAudioEvents: false,
    // One person dictating one sentence: no speakers to separate, no timings
    // to carry. Both cost tokens and neither is ever read.
    diarize: false,
    timestampsGranularity: 'none',
  },
} as const;

export const speechProviderOptions = {
  elevenlabs: {
    languageCode: 'en',
    /**
     * Fixed so that a word re-synthesised after falling out of the cache comes
     * back identical. Without it the same word drifts between renderings, and
     * a learner who replays it hears something subtly different each time.
     */
    seed: 20260821,
  },
} as const;
