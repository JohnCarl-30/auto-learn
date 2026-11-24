import { elevenLabs } from '@ai-sdk/elevenlabs';
import { createOpenAI } from '@ai-sdk/openai';

/**
 * Provider wiring for the audio calls, and the text model ids. Everything a caller might want to *read*
 * — model ids, prices, provider options, the voice id — lives in `config.ts`
 * so the evals harness can import it without loading an ESM-only provider
 * package. This file re-exports it so call sites keep importing one module.
 */
export * from './config';

import {
  CARD_MODEL,
  CONVERSE_MODEL,
  PROPOSE_MODEL,
  SPEECH_MODEL,
  TRANSCRIBE_MODEL,
  voiceStudioUrl,
} from './config';

/** The model id each text call sends. */
export const proposeModel = () => PROPOSE_MODEL;
export const cardModel = () => CARD_MODEL;
export const converseModel = () => CONVERSE_MODEL;

/** ElevenLabs only: Anthropic has no speech-to-text, and OpenAI is not used. */
export const transcribeModel = () => elevenLabs.transcription(TRANSCRIBE_MODEL);

export const speechModel = () => elevenLabs.speech(SPEECH_MODEL);

/** The partner's voice. VoiceStudio speaks OpenAI's audio API, so the installed provider reaches it. */
export const partnerSpeechModel = () =>
  createOpenAI({ baseURL: voiceStudioUrl(), apiKey: 'voicestudio' }).speech(
    'tts-1',
  );
