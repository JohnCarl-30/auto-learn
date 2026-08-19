import {
  ApiError,
  ProposeResponse,
  type ProposeRequest,
} from '@auto-learn/shared';

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

export async function propose(
  body: ProposeRequest,
): Promise<ProposeResponse> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}/propose`, {
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
  const parsed = ProposeResponse.safeParse(payload);
  if (!parsed.success) throw new ApiFailure(malformed);

  return parsed.data;
}
