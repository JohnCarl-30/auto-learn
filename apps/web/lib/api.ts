import {
  ApiError,
  CardResponse,
  ProposeResponse,
  ProposeStreamEvent,
  type CardRequest,
  type ProposeRequest,
  type StreamedFix,
  type StreamedGate,
  type TelemetryEvent,
} from '@auto-learn/shared';
import type { ZodType } from 'zod';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Carries the server's structured error so the UI can branch on `code`. */
export class ApiFailure extends Error {
  constructor(readonly detail: ApiError) {
    super(detail.message);
    this.name = 'ApiFailure';
  }
}

const unreachable: ApiError = {
  code: 'upstream_failed',
  message: "Can't reach the server. Is the API running on port 3001?",
};

const malformed: ApiError = {
  code: 'upstream_failed',
  message: 'The server sent back something unexpected.',
};

async function post<T>(
  path: string,
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure(unreachable);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = ApiError.safeParse(payload);
    throw new ApiFailure(parsed.success ? parsed.data : malformed);
  }

  // Validate on the way in, with the same schema the server built it from.
  // A drifted contract fails here, loudly, rather than as a blank render.
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiFailure(malformed);

  return parsed.data;
}

export function propose(body: ProposeRequest): Promise<ProposeResponse> {
  return post('/propose', body, ProposeResponse);
}

/** A fix or a gate, as the model writes it. Neither carries a withheld wording. */
export type ProposePreview = StreamedFix | StreamedGate;

/**
 * The same request, read as it arrives.
 *
 * Resolves with exactly what `propose` returns — the events before it are a
 * preview and nothing is built from them, so a client that ignored `onPreview`
 * entirely would still be correct. That is deliberate: it keeps the gate's
 * guarantee in one place instead of spread across a progressive render.
 */
export async function proposeStream(
  body: ProposeRequest,
  onPreview: (preview: ProposePreview) => void,
): Promise<ProposeResponse> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}/propose/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure(unreachable);
  }

  // Refusals still arrive as ordinary status codes: the server validates
  // before it writes a byte, precisely so this branch stays possible.
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const parsed = ApiError.safeParse(payload);
    throw new ApiFailure(parsed.success ? parsed.data : malformed);
  }

  if (!response.body) throw new ApiFailure(malformed);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished: ProposeResponse | null = null;

  const consume = (line: string): void => {
    if (!line.trim()) return;

    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch {
      throw new ApiFailure(malformed);
    }

    // Validated with the same schema the server built it from, exactly like
    // the non-streaming path. A drifted contract fails loudly here.
    const event = ProposeStreamEvent.safeParse(payload);
    if (!event.success) throw new ApiFailure(malformed);

    switch (event.data.kind) {
      case 'fix':
      case 'gate':
        onPreview(event.data);
        return;
      case 'done':
        finished = event.data.response;
        return;
      case 'error':
        throw new ApiFailure(event.data.error);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // A chunk can split a line anywhere, so only what precedes the last
    // newline is complete. The remainder waits for the next read.
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) consume(line);
  }

  consume(buffer);

  // The stream ended without the payload: the server died mid-generation, or
  // something in between truncated it. Either way there is nothing to review,
  // and pretending otherwise would show a half-proposal as a finished one.
  if (!finished) throw new ApiFailure(malformed);
  return finished;
}

/**
 * Fetching this is what releases the withheld wording — the replacement is not
 * in the propose payload at all, so this call *is* the gate opening.
 */
export function fetchCard(body: CardRequest): Promise<CardResponse> {
  return post('/card', body, CardResponse);
}

/**
 * Accept and reject are the numbers that say whether people take what the gate
 * teaches, and they only exist in the browser. Fire-and-forget: a dropped
 * count is not worth failing a user action over.
 */
export function reportEvent(event: TelemetryEvent['event']): void {
  void fetch(`${BASE_URL}/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => undefined);
}
