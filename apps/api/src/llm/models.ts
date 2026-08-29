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
  PROPOSE_MODEL,
  SPEECH_MODEL,
  TRANSCRIBE_MODEL,
} from './config';

export const proposeModel = () => openai(PROPOSE_MODEL);
export const cardModel = () => openai(CARD_MODEL);

export const transcribeModel = () => elevenLabs.transcription(TRANSCRIBE_MODEL);
export const speechModel = () => elevenLabs.speech(SPEECH_MODEL);
