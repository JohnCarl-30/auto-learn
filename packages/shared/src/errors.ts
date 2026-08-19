import { z } from 'zod';

export const ApiErrorCode = z.enum([
  'invalid_request',
  'too_many_sentences',
  'empty_input',
  'session_not_found',
  'suggestion_not_found',
  'word_not_in_sentence',
  'upstream_failed',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiError = z.object({
  code: ApiErrorCode,
  message: z.string(),
  /** Present on too_many_sentences so the UI can say how many were found. */
  sentenceCount: z.number().int().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
