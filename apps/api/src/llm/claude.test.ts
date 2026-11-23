import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { streamObject } from './claude';

/**
 * The wrapper's own logic, against a fake client: partial objects from JSON
 * text deltas, usage mapped for `priceCall`, and a cut-off reply refused.
 * vitest, because it loads the real (ESM-only) partial-JSON parser from `ai`.
 */
const stream = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream, parse: vi.fn(), create: vi.fn() };
  },
}));
vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: () => ({ type: 'json_schema' }),
}));

const Schema = z.object({ word: z.string(), synonyms: z.array(z.string()) });
const json = '{"word":"vast","synonyms":["huge","immense"]}';

function fakeStream(chunks: string[], stopReason = 'end_turn') {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve();
      yield { type: 'content_block_start', content_block: { type: 'text' } };
      for (const text of chunks) {
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text },
        };
      }
    },
    finalMessage: () =>
      Promise.resolve({
        stop_reason: stopReason,
        content: [{ type: 'text', text: chunks.join('') }],
        usage: {
          input_tokens: 200,
          cache_read_input_tokens: 1_000,
          cache_creation_input_tokens: 0,
          output_tokens: 30,
        },
      }),
  };
}

const call = () =>
  streamObject({
    model: 'claude-haiku-5-5',
    system: 's',
    prompt: 'p',
    schema: Schema,
    providerOptions: { effort: 'low', thinking: false },
    maxOutputTokens: 100,
    maxRetries: 0,
    abortSignal: new AbortController().signal,
  });

describe('streamObject', () => {
  beforeEach(() => stream.mockReset());

  it('yields the object as it is written, then the validated whole', async () => {
    stream.mockReturnValue(fakeStream([json.slice(0, 14), json.slice(14)]));
    const result = call();

    const partials = [];
    for await (const partial of result.partialObjectStream) {
      partials.push(partial);
    }

    expect(partials[0]).toEqual({ word: 'vast' });
    expect(partials.at(-1)).toEqual(JSON.parse(json));
    await expect(result.object).resolves.toEqual(JSON.parse(json));
  });

  it('reports input as the inclusive total with the cached part apart', async () => {
    stream.mockReturnValue(fakeStream([json]));
    const result = call();
    for await (const _ of result.partialObjectStream) void _;

    await expect(result.usage).resolves.toEqual({
      inputTokens: 1_200,
      outputTokens: 30,
      inputTokenDetails: { cacheReadTokens: 1_000 },
    });
  });

  it('refuses an object cut off at max_tokens', async () => {
    stream.mockReturnValue(fakeStream(['{"word":"va'], 'max_tokens'));
    const result = call();

    await expect(async () => {
      for await (const _ of result.partialObjectStream) void _;
    }).rejects.toThrow('max_tokens');
    await expect(result.object).rejects.toThrow('max_tokens');
  });
});
