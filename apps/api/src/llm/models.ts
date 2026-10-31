import { elevenLabs } from '@ai-sdk/elevenlabs';
import { openai } from '@ai-sdk/openai';

/**
 * Provider wiring, and nothing else. Everything a caller might want to *read*
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
} from './config';

export const proposeModel = () => openai(PROPOSE_MODEL);
export const cardModel = () => openai(CARD_MODEL);
export const converseModel = () => openai(CONVERSE_MODEL);

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
