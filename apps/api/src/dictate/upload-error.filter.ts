import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { MAX_RECORDING_SECONDS, type ApiError } from '@auto-learn/shared';

/** Whether a thrown body is already one of ours. */
function isApiError(body: unknown): body is ApiError {
  return typeof body === 'object' && body !== null && 'code' in body;
}

/**
 * Says what actually happened when an upload is refused.
 *
 * Same reasoning as ApiThrottlerGuard: the browser parses every failure with
 * the `ApiError` schema, so a refusal in any other shape reaches the reader as
 * the generic "The server sent back something unexpected" — exactly wrong here,
 * because recording for too long is an ordinary thing to do and the message is
 * the part that tells you what to change.
 *
 * Catches HttpException rather than MulterError because the file interceptor
 * has already translated multer's codes into Nest's own exceptions by the time
 * anything reaches a filter — so the status is right and only the body is
 * wrong. Anything that already carries an `ApiError` passes through untouched;
 * this is here to convert the framework's shapes, not to second-guess ours.
 *
 * Scoped to the one controller. It is also why the upload is multipart at all:
 * body-parser rejects oversized JSON from inside middleware, before Nest's
 * router exists, where no filter can reach it.
 */
@Catch(HttpException)
export class UploadErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const original: unknown = exception.getResponse();

    if (isApiError(original)) {
      response.status(status).json(original);
      return;
    }

    // `getStatus()` hands back a plain number, so compare like one.
    const tooLong = status === Number(HttpStatus.PAYLOAD_TOO_LARGE);

    const body: ApiError = tooLong
      ? {
          code: 'recording_too_long',
          message: `That recording is too long. I take up to ${MAX_RECORDING_SECONDS} seconds at a time.`,
        }
      : {
          code: 'invalid_request',
          message: "That doesn't look like a recording I can read.",
        };

    response
      .status(tooLong ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST)
      .json(body);
  }
}
