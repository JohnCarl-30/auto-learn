import { describe, expect, it } from 'vitest';
import {
  CARD_MODEL,
  CONVERSE_MODEL,
  PROPOSE_MODEL,
  SPEECH_MODEL,
  TRANSCRIBE_MODEL,
  cardModel,
  cardProviderOptions,
  converseModel,
  proposeModel,
  proposeProviderOptions,
  speechModel,
  speechProviderOptions,
  speechVoice,
  transcribeModel,
  transcribeProviderOptions,
} from './models';

/**
 * A `*.test.ts` file, so vitest owns it — this is the reason the API runs two
 * runners. The audio assertions load the real `@ai-sdk/elevenlabs`, which is ESM-only
 * and cannot be imported by jest's CJS runtime at all; the `*.spec.ts` suites
 * have to mock it out. Anything that must verify behaviour against the actual
 * SDK belongs here.
 */
describe('model wiring (against the real SDK)', () => {
  it('sends every text call to Claude Haiku 5.5', () => {
    expect(proposeModel()).toBe(PROPOSE_MODEL);
    expect(cardModel()).toBe(CARD_MODEL);
    expect(converseModel()).toBe(CONVERSE_MODEL);
    expect(PROPOSE_MODEL).toBe('claude-haiku-5-5');
    expect(CARD_MODEL).toBe('claude-haiku-5-5');
  });

  it('turns thinking off on the call the user waits for', () => {
    expect(proposeProviderOptions.thinking).toBe(false);
  });

  it('lets the card call think, since quality outranks latency there', () => {
    expect(cardProviderOptions.thinking).toBe(true);
  });

  it('transcribes with ElevenLabs', () => {
    expect(transcribeModel().modelId).toBe(TRANSCRIBE_MODEL);
    expect(transcribeModel().modelId).toBe('scribe_v2');
    expect(transcribeModel().provider).toContain('elevenlabs');
  });

  it('resolves the speech model against the real ElevenLabs provider', () => {
    expect(speechModel().modelId).toBe(SPEECH_MODEL);
    expect(speechModel().provider).toContain('elevenlabs');
  });

  /**
   * The one transcription setting that is not a preference. Left to
   * auto-detect, strongly accented English can be identified as another
   * language and come back translated rather than transcribed — silently, and
   * worst for the learners this product exists for.
   */
  it('pins transcription to English rather than letting it guess', () => {
    expect(transcribeProviderOptions.elevenlabs.languageCode).toBe('en');
  });

  it('keeps audio-event tags out of what lands in someone drafting a sentence', () => {
    expect(transcribeProviderOptions.elevenlabs.tagAudioEvents).toBe(false);
  });

  it('fixes the seed, so a word re-synthesised later sounds the same', () => {
    expect(speechProviderOptions.elevenlabs.seed).toEqual(expect.any(Number));
  });

  /**
   * Voice ids are account-scoped and ElevenLabs withdraws the shared Default
   * voices at the end of 2026, so there is no id worth committing as a
   * fallback — an unset one has to read as unset.
   */
  it('takes the voice from the environment, with no default worth having', () => {
    const original = process.env.ELEVENLABS_VOICE_ID;
    delete process.env.ELEVENLABS_VOICE_ID;
    expect(speechVoice()).toBe('');

    process.env.ELEVENLABS_VOICE_ID = 'voice-one';
    expect(speechVoice()).toBe('voice-one');

    if (original === undefined) delete process.env.ELEVENLABS_VOICE_ID;
    else process.env.ELEVENLABS_VOICE_ID = original;
  });
});
