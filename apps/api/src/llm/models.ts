import { openai } from '@ai-sdk/openai';

/**
 * Two calls with opposite priorities.
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
