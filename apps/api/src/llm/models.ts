import { elevenLabs } from '@ai-sdk/elevenlabs';
import { createOpenAI, openai } from '@ai-sdk/openai';

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
  OPENAI_TRANSCRIBE_MODEL,
  PROPOSE_MODEL,
  SPEECH_MODEL,
  TRANSCRIBE_MODEL,
  voiceStudioUrl,
} from './config';

/**
 * The model id each text call sends. A local Ollama model in place of every
 * Claude model when OLLAMA_MODEL is set: free and offline, for running the app
 * without a key (`claude.ts` points the client at Ollama to match).
 *
 * Read at call time, as `transcribeModel` is, because the environment is
 * loaded after the module graph.
 */
const textModel = (id: string) => process.env.OLLAMA_MODEL || id;

export const proposeModel = () => textModel(PROPOSE_MODEL);
export const cardModel = () => textModel(CARD_MODEL);
export const converseModel = () => textModel(CONVERSE_MODEL);

/**
 * ElevenLabs when its key is set, OpenAI otherwise — so the free deploy
 * dictates on the one key it already has, and a deploy that configures
 * ElevenLabs keeps the model it was tuned for.
 *
 * Read at call time, not import time: the environment is loaded after the
 * module graph, and tests flip the key between calls.
 */
export const transcribeModel = () =>
  process.env.ELEVENLABS_API_KEY
    ? elevenLabs.transcription(TRANSCRIBE_MODEL)
    : openai.transcription(OPENAI_TRANSCRIBE_MODEL);

export const speechModel = () => elevenLabs.speech(SPEECH_MODEL);

/** The partner's voice. VoiceStudio speaks OpenAI's audio API, so the installed provider reaches it. */
export const partnerSpeechModel = () =>
  createOpenAI({ baseURL: voiceStudioUrl(), apiKey: 'voicestudio' }).speech(
    'tts-1',
  );
