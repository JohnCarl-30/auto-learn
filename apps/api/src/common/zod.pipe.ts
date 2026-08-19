import { HttpException, HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Validates a request body against the same schema the client builds it from. */
export class ZodBody<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
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
}
