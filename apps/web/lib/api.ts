import {
  ApiError,
  CardResponse,
  ProposeResponse,
  type CardRequest,
  type ProposeRequest,
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

/**
 * Fetching this is what releases the withheld wording — the replacement is not
 * in the propose payload at all, so this call *is* the gate opening.
 */
export function fetchCard(body: CardRequest): Promise<CardResponse> {
  return post('/card', body, CardResponse);
}
