/**
 * Model choice, prices and provider options — deliberately free of any import
 * of `@ai-sdk/openai`.
 *
 * That constraint is what lets `evals/` import this file. The SDK is ESM-only,
 * `apps/api` is CommonJS, and pulling the provider into an ESM harness through
 * a CJS module is the same collision that forces the two test runners apart
 * (see `.claude/skills/testing`). Data here, wiring in `models.ts`.
 *
 * Two calls with opposite priorities.
 *
 * PROPOSE runs on every submission with the user watching a spinner, so it
 * takes the cheap model with reasoning off. CARD fires only after the user has
 * committed by opening a gate, so it can afford to think — and it is the
 * artifact the product exists to deliver, where a wrong nuance claim teaches a
 * learner something false.
 *
 * Cached input is 90% off, which is why the system prompts are constants in
 * `prompts.ts` and never interpolate per-request values.
 */
export const PROPOSE_MODEL = 'gpt-5.6-luna';
export const CARD_MODEL = 'gpt-5.6-terra';

/**
 * USD per 1M tokens. Code rather than a comment because `evals/` prices its
 * runs from this table — a number with a job gets noticed when it goes stale,
 * and a stale price silently misreports what a run cost.
 */
export const MODEL_PRICES: Record<
  string,
  { input: number; cachedInput: number; output: number }
> = {
  [PROPOSE_MODEL]: { input: 1, cachedInput: 0.1, output: 6 },
  [CARD_MODEL]: { input: 2.5, cachedInput: 0.25, output: 15 },
};

/**
 * Output caps, exported for the same reason the prompts are: a truncated
 * generation is a different generation, so a harness that guessed this number
 * would be scoring a call production never makes.
 */
export const PROPOSE_MAX_OUTPUT_TOKENS = 2000;
export const CARD_MAX_OUTPUT_TOKENS = 1200;

/**
 * Failure policy for both calls.
 *
 * The SDK retries on its own but bounds nothing in wall-clock terms, so a
 * connection that opens and then stalls hangs the request until the platform
 * kills it — and the reader watches a spinner the whole time. The card call
 * gets longer because it reasons, and because by then the reader has committed
 * by opening a gate and would rather wait than lose it.
 */
export const MODEL_MAX_RETRIES = 2;
export const PROPOSE_TIMEOUT_MS = 30_000;
export const CARD_TIMEOUT_MS = 45_000;

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
