import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { parsePartialJson, type DeepPartial } from 'ai';
import type { ZodType } from 'zod';
import type { ClaudeOptions } from './config';
import type { RawUsage } from './pricing';

export type { DeepPartial };

/**
 * The three text calls the services make, on the Anthropic SDK.
 *
 * Named and shaped like the AI SDK functions they replaced (`generateObject`,
 * `streamObject`, `generateText`) so the services and their specs kept their
 * structure: same arguments, same `{ object, usage }` back, `usage` already in
 * the shape `priceCall` reads.
 */
interface CallArgs {
  /** A Claude model id, or the local model when OLLAMA_MODEL is set (see models.ts). */
  model: string;
  system: string;
  prompt: string;
  providerOptions: ClaudeOptions;
  maxOutputTokens: number;
  maxRetries: number;
  abortSignal: AbortSignal;
}

/**
 * One client per process. Ollama speaks the Anthropic Messages API too, so
 * OLLAMA_MODEL points the same client at it for free, offline runs.
 *
 * Built on first use, not at import: the environment is loaded after the
 * module graph, and tests flip it between calls.
 */
let cached: { key: string; client: Anthropic } | undefined;
function client(): Anthropic {
  const local = process.env.OLLAMA_MODEL;
  const key = local
    ? `ollama:${process.env.OLLAMA_BASE_URL ?? ''}`
    : 'anthropic';
  if (cached?.key !== key) {
    cached = {
      key,
      client: local
        ? new Anthropic({
            baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            apiKey: 'ollama',
          })
        : new Anthropic(),
    };
  }
  return cached.client;
}

function request(args: CallArgs) {
  const { effort, thinking } = args.providerOptions;
  return {
    model: args.model,
    max_tokens: args.maxOutputTokens,
    // The system prompts are constants (prompts.ts) so this prefix can be
    // served from cache; anything per-request goes in the user turn.
    system: [
      {
        type: 'text' as const,
        text: args.system,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages: [{ role: 'user' as const, content: args.prompt }],
    thinking: thinking
      ? { type: 'adaptive' as const }
      : { type: 'disabled' as const },
    /** Goes in `output_config` beside the format, so each call places it. */
    effort,
  };
}

function options(args: CallArgs): Anthropic.RequestOptions {
  return { maxRetries: args.maxRetries, signal: args.abortSignal };
}

/**
 * Anthropic counts cached and uncached input separately; `priceCall` expects
 * the inclusive total plus the cached part, as the AI SDK reported it.
 */
function toRawUsage(usage: Anthropic.Usage): RawUsage {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return {
    inputTokens:
      usage.input_tokens + cacheRead + (usage.cache_creation_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
    inputTokenDetails: { cacheReadTokens: cacheRead },
  };
}

/**
 * A declined response is not an answer, whatever its text says; nor is an
 * object cut off mid-way. Plain text may stop at its cap on purpose (the
 * session word asks for one word and keeps the first).
 */
function assertFinished(message: Anthropic.Message, complete = true): void {
  if (complete && message.stop_reason === 'max_tokens') {
    throw new Error(`stopped at max_tokens (${message.usage.output_tokens})`);
  }
  if (message.stop_reason === 'refusal') {
    throw new Error(
      `refused${message.stop_details?.category ? ` (${message.stop_details.category})` : ''}`,
    );
  }
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('');
}

export async function generateObject<T>(
  args: CallArgs & { schema: ZodType<T> },
): Promise<{ object: T; usage: RawUsage }> {
  const { effort, ...params } = request(args);
  const message = await client().messages.parse(
    {
      ...params,
      output_config: { effort, format: zodOutputFormat(args.schema) },
    },
    options(args),
  );
  assertFinished(message);
  if (message.parsed_output == null) {
    throw new Error('the reply did not match the schema');
  }
  return {
    object: message.parsed_output,
    usage: toRawUsage(message.usage),
  };
}

export async function generateText(
  args: CallArgs,
): Promise<{ text: string; usage: RawUsage }> {
  const { effort, ...params } = request(args);
  const message = await client().messages.create(
    { ...params, output_config: { effort } },
    options(args),
  );
  assertFinished(message, false);
  return { text: textOf(message), usage: toRawUsage(message.usage) };
}

/**
 * The object as it is written. Structured output streams as JSON text, so each
 * text delta is re-parsed as far as it goes; the final object is the full text
 * validated against the schema, never a partial.
 *
 * `object` and `usage` reject if the stream fails, and are only settled once
 * `partialObjectStream` has been read to the end.
 */
export function streamObject<T>(args: CallArgs & { schema: ZodType<T> }): {
  partialObjectStream: AsyncIterable<DeepPartial<T>>;
  object: Promise<T>;
  usage: Promise<RawUsage>;
} {
  const { effort, ...params } = request(args);
  const stream = client().messages.stream(
    {
      ...params,
      output_config: { effort, format: zodOutputFormat(args.schema) },
    },
    options(args),
  );

  let settle!: (value: { object: T; usage: RawUsage }) => void;
  let fail!: (error: unknown) => void;
  const finished = new Promise<{ object: T; usage: RawUsage }>((ok, ko) => {
    settle = ok;
    fail = ko;
  });
  const object = finished.then((r) => r.object);
  const usage = finished.then((r) => r.usage);
  // A failure is thrown from the loop, and callers then never await these.
  // Unhandled, Node would treat each rejection as fatal.
  for (const promise of [object, usage]) promise.catch(() => undefined);

  async function* partials(): AsyncGenerator<DeepPartial<T>> {
    try {
      let text = '';
      let last = '';
      for await (const event of stream) {
        if (
          event.type !== 'content_block_delta' ||
          event.delta.type !== 'text_delta'
        ) {
          continue;
        }
        text += event.delta.text;
        const { value } = await parsePartialJson(text);
        const serialised = JSON.stringify(value);
        if (value && typeof value === 'object' && serialised !== last) {
          last = serialised;
          yield value as DeepPartial<T>;
        }
      }

      const message = await stream.finalMessage();
      assertFinished(message);
      const object = args.schema.parse(JSON.parse(textOf(message)));
      settle({ object, usage: toRawUsage(message.usage) });
    } catch (error) {
      fail(error);
      throw error;
    }
  }

  return { partialObjectStream: partials(), object, usage };
}
