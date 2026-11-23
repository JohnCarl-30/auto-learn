import type { ZodType } from 'zod';
import { HttpException, HttpStatus } from './http';

/** Validates a value against the same schema the client builds it from. */
export function parseOr400<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpException(
      {
        code: 'invalid_request',
        message: result.error.issues[0]?.message ?? 'Invalid request.',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  return result.data;
}

/**
 * The JSON body, validated. A body that is not JSON at all is the same
 * mistake as one with the wrong fields, and gets the same answer.
 */
export async function body<T>(
  request: { json(): Promise<unknown> },
  schema: ZodType<T>,
): Promise<T> {
  const raw = await request.json().catch(() => undefined);
  return parseOr400(schema, raw);
}
