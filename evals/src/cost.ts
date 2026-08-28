import { MODEL_PRICES } from '../../apps/api/src/llm/config';
import type { Spend } from './types';

/**
 * The AI SDK's usage object, structurally. Typed here rather than imported so
 * this file stays free of `ai` — see `config.ts` in the API for why the ESM
 * boundary is worth respecting.
 */
export interface RawUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  inputTokenDetails?: { cacheReadTokens?: number | undefined } | undefined;
}

export const emptySpend = (): Spend => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  usd: 0,
  calls: 0,
});

/**
 * Prices one call.
 *
 * `inputTokens` from the provider is inclusive of cached tokens, so the
 * uncached count is the difference — bill the two at different rates or a run
 * that is 90% cache reads reads as ten times its real cost.
 */
export function priceCall(model: string, usage: RawUsage): Spend {
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

  return { inputTokens, cachedInputTokens, outputTokens, usd, calls: 1 };
}

export function addSpend(a: Spend, b: Spend): Spend {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    // Unknown poisons the sum on purpose: one unpriced model makes the total
    // unknown, and printing a confident wrong number is worse than a dash.
    usd: a.usd === null || b.usd === null ? null : a.usd + b.usd,
    calls: a.calls + b.calls,
  };
}

export const sumSpend = (spends: Spend[]): Spend =>
  spends.reduce(addSpend, emptySpend());

export function formatSpend(spend: Spend): string {
  const cached = spend.cachedInputTokens
    ? ` (${spend.cachedInputTokens.toLocaleString()} cached)`
    : '';
  const usd = spend.usd === null ? 'unpriced' : `$${spend.usd.toFixed(4)}`;
  return `${spend.calls} calls · ${spend.inputTokens.toLocaleString()} in${cached} / ${spend.outputTokens.toLocaleString()} out · ${usd}`;
}
