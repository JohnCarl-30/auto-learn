import {
  ApiError,
  CardResponse,
  CardStreamEvent,
  DictateResponse,
  ProposeResponse,
  ProposeStreamEvent,
  SpeakResponse,
  type CardRequest,
  type ProposeRequest,
  type PartOfSpeech,
  type StreamedFix,
  type StreamedGate,
  type SynonymNuance,
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
/**
 * Opens a streaming POST, or throws the refusal it came back with.
 *
 * Both streaming routes validate before writing a byte, precisely so a refusal
 * is still an ordinary status code here rather than a line buried in a body a
 * client may have stopped reading.
 */
async function openStream(path: string, body: unknown): Promise<Response> {
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

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const parsed = ApiError.safeParse(payload);
    throw new ApiFailure(parsed.success ? parsed.data : malformed);
  }

  if (!response.body) throw new ApiFailure(malformed);
  return response;
}

/**
 * One validated event per line.
 *
 * A chunk can split a line anywhere, so only what precedes the last newline is
 * complete; the remainder waits for the next read. Every line is checked
 * against the same schema the server built it from, so a drifted contract
 * fails here rather than as a blank render.
 */
async function* ndjson<T>(
  response: Response,
  schema: ZodType<T>,
): AsyncGenerator<T> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parse = (line: string): T | null => {
    if (!line.trim()) return null;

    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch {
      throw new ApiFailure(malformed);
    }

    const event = schema.safeParse(payload);
    if (!event.success) throw new ApiFailure(malformed);
    return event.data;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const event = parse(line);
      if (event) yield event;
    }
  }

  const last = parse(buffer);
  if (last) yield last;
}

/**
 * The proposal, read as it arrives.
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
  const response = await openStream('/propose/stream', body);
  let finished: ProposeResponse | null = null;

  for await (const event of ndjson(response, ProposeStreamEvent)) {
    switch (event.kind) {
      case 'fix':
      case 'gate':
        onPreview(event);
        break;
      case 'done':
        finished = event.response;
        break;
      case 'error':
        throw new ApiFailure(event.error);
    }
  }

  // The stream ended without the payload: the server died mid-generation, or
  // something in between truncated it. Either way there is nothing to review,
  // and pretending otherwise would show a half-proposal as a finished one.
  if (!finished) throw new ApiFailure(malformed);
  return finished;
}

/** What a card looks like before it is finished. Every field may still be empty. */
export interface PartialCard {
  word: string | null;
  partOfSpeech: PartOfSpeech | null;
  definition: string | null;
  synonyms: SynonymNuance[];
  useCases: string[];
}

export const emptyCard = (): PartialCard => ({
  word: null,
  partOfSpeech: null,
  definition: null,
  synonyms: [],
  useCases: [],
});

/**
 * The card, read as it is written.
 *
 * A card takes between four and thirteen seconds and the definition is
 * finished long before the examples are, so the line the reader clicked for
 * can be on screen while the rest is still being written. Same contract as
 * above: `onPreview` is a courtesy, and the resolved value is the card.
 */
export async function fetchCardStream(
  body: CardRequest,
  onPreview: (partial: PartialCard) => void,
): Promise<CardResponse> {
  const response = await openStream('/card/stream', body);
  const partial = emptyCard();
  let finished: CardResponse | null = null;

  for await (const event of ndjson(response, CardStreamEvent)) {
    switch (event.kind) {
      case 'definition':
        partial.word = event.word;
        partial.partOfSpeech = event.partOfSpeech;
        partial.definition = event.definition;
        onPreview({ ...partial });
        break;
      case 'synonym':
        partial.synonyms = [
          ...partial.synonyms,
          { word: event.word, nuance: event.nuance },
        ];
        onPreview({ ...partial });
        break;
      case 'example':
        partial.useCases = [...partial.useCases, event.text];
        onPreview({ ...partial });
        break;
      case 'done':
        finished = event.response;
        break;
      case 'error':
        throw new ApiFailure(event.error);
    }
  }

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
