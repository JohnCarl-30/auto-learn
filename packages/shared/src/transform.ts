import { z } from 'zod';

/**
 * The four transforms. Every one preserves or increases text volume — a
 * transform that deletes the user's words works against the product, since
 * text volume is card volume is vocabulary learned. This is why there is no
 * "summarize".
 */
export const TransformOption = z.enum([
  'grammar',
  'natural',
  'academic',
  'clearer',
]);
export type TransformOption = z.infer<typeof TransformOption>;

export const TRANSFORM_LABELS: Record<TransformOption, string> = {
  grammar: 'Fix my grammar',
  natural: 'Make it natural',
  academic: 'Make it academic',
  clearer: 'Make it clearer',
};

export const TRANSFORM_INSTRUCTIONS: Record<TransformOption, string> = {
  grammar:
    'Correct grammatical errors only. Do not restyle correct sentences.',
  natural:
    'Make the writing read like a fluent writer wrote it, not a textbook. Keep the meaning and the level of formality.',
  academic:
    'Raise the register to what an academic essay expects. Do not make it pompous or add hedging the writer did not intend.',
  clearer:
    'Untangle sentences that fight themselves. Preserve every claim the writer made.',
};

/** Hard cap. Overflow is refused, never silently truncated. */
export const MAX_SENTENCES = 3;
