import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import { Logger } from './http';

const logger = new Logger('ndjson');

/**
 * Sends events one JSON object per line, as they happen.
 *
 * NDJSON rather than SSE because the streamed routes are POSTs — the text is
 * the request body, and EventSource only issues GETs. One JSON object per line
 * is what a fetch reader can split on without a protocol.
 *
 * Call it only after everything that can refuse has run: once a byte of the
 * body is out, a status code is no longer an option.
 */
export function ndjson(
  c: Context,
  events: (signal: AbortSignal) => AsyncIterable<unknown>,
): Response {
  c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
  c.header('Cache-Control', 'no-cache, no-transform');
  // Proxies buffer by default, and a buffered stream is just a slower version
  // of the JSON route beside it.
  c.header('X-Accel-Buffering', 'no');

  return stream(
    c,
    async (out) => {
      // A reader who closes the tab should stop costing money mid-generation.
      const abandoned = new AbortController();
      out.onAbort(() => abandoned.abort());

      for await (const event of events(abandoned.signal)) {
        if (out.aborted) break;
        await out.write(`${JSON.stringify(event)}\n`);
      }
    },
    (error) => {
      logger.error(`stream failed: ${error.message}`);
      return Promise.resolve();
    },
  );
}
