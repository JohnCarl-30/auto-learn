import { describe, expect, it } from 'vitest';
import {
  CARD_MODEL,
  PROPOSE_MODEL,
  SPEECH_MODEL,
  TRANSCRIBE_MODEL,
  cardModel,
  cardProviderOptions,
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
 * runners. These assertions load the real `@ai-sdk/openai`, which is ESM-only
 * and cannot be imported by jest's CJS runtime at all; the `*.spec.ts` suites
 * have to mock it out. Anything that must verify behaviour against the actual
 * SDK belongs here.
 */
describe('model wiring (against the real SDK)', () => {
  it('resolves the propose model to the cheap fast tier', () => {
    const model = proposeModel();
    expect(model.modelId).toBe(PROPOSE_MODEL);
    expect(model.modelId).toBe('gpt-5.6-luna');
  });

  it('resolves the card model to the higher-quality tier', () => {
    const model = cardModel();
    expect(model.modelId).toBe(CARD_MODEL);
    expect(model.modelId).toBe('gpt-5.6-terra');
  });

  it('builds real provider model instances, not stubs', () => {
    // If the SDK were mocked, `provider` would be undefined — this is the
    // assertion that proves the ESM package actually loaded.
    expect(proposeModel().provider).toContain('openai');
    expect(proposeModel().specificationVersion).toBeDefined();
  });

  it('turns reasoning off on the call the user waits for', () => {
    expect(proposeProviderOptions.openai.reasoningEffort).toBe('none');
  });

  it('lets the card call reason, since quality outranks latency there', () => {
    expect(cardProviderOptions.openai.reasoningEffort).toBe('low');
  });

  it('keeps the two prompt cache keys distinct', () => {
    expect(proposeProviderOptions.openai.promptCacheKey).not.toBe(
      cardProviderOptions.openai.promptCacheKey,
    );
  });

  it('resolves the voice models against the real ElevenLabs provider', () => {
    expect(transcribeModel().modelId).toBe(TRANSCRIBE_MODEL);
    expect(speechModel().modelId).toBe(SPEECH_MODEL);
    expect(transcribeModel().provider).toContain('elevenlabs');
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
