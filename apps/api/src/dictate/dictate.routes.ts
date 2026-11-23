import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  MAX_LESSON_RECORDING_SECONDS,
  MAX_RECORDING_BYTES,
  MAX_RECORDING_SECONDS,
  isAudioMediaType,
  type ApiError,
} from '@auto-learn/shared';
import { signedIn } from '../auth/auth.middleware';
import { HttpException, HttpStatus } from '../common/http';
import { rateLimit } from '../common/rate-limit';
import type { DictateService } from './dictate.service';

/** Room for the multipart boundary and part headers around the recording itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

// Both limits, because one route takes both: a lesson answer may run past the
// minute that holds everywhere else.
const TOO_LONG: ApiError = {
  code: 'recording_too_long',
  message: `That recording is too long. I take up to ${MAX_RECORDING_SECONDS} seconds at a time, or ${MAX_LESSON_RECORDING_SECONDS / 60} minutes for a lesson answer.`,
};

const UNREADABLE = new HttpException(
  {
    code: 'invalid_request',
    message: "That doesn't look like a recording I can read.",
  } satisfies ApiError,
  HttpStatus.BAD_REQUEST,
);

/**
 * Multipart rather than the JSON every other route here takes.
 *
 * Uniformity loses exactly once, and this is it. Base64 in JSON would mean
 * raising the body limit globally — a twenty-fold buffer increase on
 * /propose, the one route whose entire design is about bounding what a single
 * request can cost. Multipart bounds the size here and nowhere else.
 *
 * Every refusal is an `ApiError`: recording for too long is an ordinary thing
 * to do, and the message is the part that tells you what to change.
 */
export function dictateRoutes(service: DictateService) {
  return new Hono().post(
    '/',
    signedIn,
    rateLimit('dictate'),
    bodyLimit({
      maxSize: MAX_RECORDING_BYTES + MULTIPART_OVERHEAD_BYTES,
      onError: (c) => c.json(TOO_LONG, 413),
    }),
    async (c) => {
      const form = await c.req.parseBody().catch(() => ({}) as never);
      const file: unknown = (form as Record<string, unknown>).audio;

      // Absent either because nothing was sent, or because it is not audio —
      // both are the caller sending something we cannot read.
      if (!(file instanceof File) || !isAudioMediaType(file.type)) {
        throw UNREADABLE;
      }
      if (file.size > MAX_RECORDING_BYTES) return c.json(TOO_LONG, 413);
      if (file.size === 0) throw UNREADABLE;

      // 201, as Nest answered every POST without an explicit code.
      return c.json(
        await service.dictate(new Uint8Array(await file.arrayBuffer())),
        201,
      );
    },
  );
}
