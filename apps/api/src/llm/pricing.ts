import { MODEL_PRICES } from './config';

/**
 * The AI SDK's usage object, structurally.
 *
 * Typed here rather than imported so this module stays free of `ai` — same
 * ESM boundary `config.ts` keeps, and the reason `evals/` can share this code
 * instead of carrying a second copy of the arithmetic.
 */
export interface RawUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  inputTokenDetails?: { cacheReadTokens?: number | undefined } | undefined;
}

export interface CallSpend {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** Null when the model is not in the price table — unknown, never zero. */
  usd: number | null;
}

/**
 * Prices one call.
 *
 * `inputTokens` from the provider is inclusive of cached tokens, so the
 * uncached count is the difference. Bill the two at one rate and a run that is
 * 90% cache reads reads as ten times its real cost — which is exactly the
 * number the prompt-cache work exists to move.
 */
export function priceCall(model: string, usage: RawUsage): CallSpend {
  const inputTokens = usage.inputTokens ?? 0;
  const cachedInputTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const uncached = Math.max(0, inputTokens - cachedInputTokens);

  const price = MODEL_PRICES[model];
  const usd = price
    ? (uncached * price.input +
        cachedInputTokens * price.cachedInput +
        outputTokens * price.output) /
      1_000_000
    : null;

  return { inputTokens, cachedInputTokens, outputTokens, usd };
}
