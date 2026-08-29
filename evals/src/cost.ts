import { priceCall as priceOneCall } from '../../apps/api/src/llm/pricing';
import type { RawUsage } from '../../apps/api/src/llm/pricing';
import type { Spend } from './types';

export type { RawUsage };

export const emptySpend = (): Spend => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  usd: 0,
  calls: 0,
});

/**
 * Prices one call, using the same function production prices itself with.
 *
 * The harness carried its own copy of this until the API grew a need for it,
 * and two implementations of the same arithmetic is how a run comes to report
 * a cost the service disagrees with.
 */
export const priceCall = (model: string, usage: RawUsage): Spend => ({
  ...priceOneCall(model, usage),
  calls: 1,
});

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
