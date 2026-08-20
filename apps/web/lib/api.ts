import {
  ApiError,
  CardResponse,
  DictateResponse,
  ProposeResponse,
  SpeakResponse,
  type CardRequest,
  type ProposeRequest,
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

/**
 * The one place a response is turned into either a value or an ApiFailure.
 *
 * Shared by every caller below, including the one that uploads audio, so there
 * stays exactly one `ApiError.safeParse` in this file. A second reader of
 * failures is how the two drift apart and a real refusal starts arriving as
 * "something unexpected".
 */
async function handle<T>(response: Response, schema: ZodType<T>): Promise<T> {
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

  return handle(response, schema);
}

async function get<T>(path: string, schema: ZodType<T>): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`);
  } catch {
    throw new ApiFailure(unreachable);
  }

  return handle(response, schema);
}

export function propose(body: ProposeRequest): Promise<ProposeResponse> {
  return post('/propose', body, ProposeResponse);
}

/**
 * Fetching this is what releases the withheld wording — the replacement is not
 * in the propose payload at all, so this call *is* the gate opening.
 */
export function fetchCard(body: CardRequest): Promise<CardResponse> {
  return post('/card', body, CardResponse);
}

/**
 * Turns a recording into text, and nothing more.
 *
 * The only caller here that does not send JSON. `Content-Type` is deliberately
 * unset: the browser has to write it itself, because only it knows the
 * multipart boundary it just generated.
 */
export async function dictate(recording: Blob): Promise<DictateResponse> {
  const body = new FormData();
  body.append('audio', recording, 'recording');

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}/dictate`, { method: 'POST', body });
  } catch {
    throw new ApiFailure(unreachable);
  }

  return handle(response, DictateResponse);
}

/**
 * Asks for a word to be said out loud.
 *
 * Only called for words the dictionary had no recording of — and a GET, so the
 * browser keeps the answer and a second play costs nothing at all.
 */
export function speak(word: string): Promise<SpeakResponse> {
  return get(`/speak/${encodeURIComponent(word)}`, SpeakResponse);
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
