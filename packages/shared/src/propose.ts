import { z } from 'zod';
import { TransformOption } from './transform';

/**
 * Tier 1 — mechanical. Fixed without comment and shown in the diff. Nobody's
 * vocabulary improves from a comma, and gating one spends the gate's power on
 * something not worth stopping for.
 */
export const SilentFixType = z.enum(['typo', 'spacing', 'punctuation']);
export type SilentFixType = z.infer<typeof SilentFixType>;

/**
 * Tier 2 — teachable. These are gated behind a word card.
 */
export const GatedSuggestionType = z.enum([
  'grammar',
  'word-choice',
  'register',
]);
export type GatedSuggestionType = z.infer<typeof GatedSuggestionType>;

export const SilentFix = z.object({
  id: z.string(),
  type: SilentFixType,
  original: z.string(),
  replacement: z.string(),
  start: z.number().int(),
  end: z.number().int(),
  /** One short line, shown inline in the diff. Never a card. */
  note: z.string(),
});
export type SilentFix = z.infer<typeof SilentFix>;

/**
 * Note what is NOT here: `replacement`.
 *
 * The gate is structural rather than a permission check. The server withholds
 * the proposed wording until the client requests the card, so a client cannot
 * apply a tier-2 edit it has not been taught. There is no flag to forge and no
 * "was this opened?" bookkeeping to get wrong — the text simply does not exist
 * on the client yet.
 */
export const GatedSuggestion = z.object({
  id: z.string(),
  type: GatedSuggestionType,
  original: z.string(),
  start: z.number().int(),
  end: z.number().int(),
  /** Says a change is available without giving it away, e.g. "stronger word". */
  teaser: z.string(),
});
export type GatedSuggestion = z.infer<typeof GatedSuggestion>;

export const ReviewedSentence = z.object({
  index: z.number().int(),
  /** Exactly as the user typed it. */
  original: z.string(),
  /** Tier-1 fixes already applied; all offsets below are into this string. */
  text: z.string(),
  silentFixes: z.array(SilentFix),
  gated: z.array(GatedSuggestion),
});
export type ReviewedSentence = z.infer<typeof ReviewedSentence>;

export const ProposeRequest = z.object({
  text: z.string().min(1),
  option: TransformOption,
});
export type ProposeRequest = z.infer<typeof ProposeRequest>;

export const ProposeResponse = z.object({
  /** Handle for the server-held proposal, including the withheld wordings. */
  sessionId: z.string(),
  sentences: z.array(ReviewedSentence),
});
export type ProposeResponse = z.infer<typeof ProposeResponse>;

// --- What the model itself returns -------------------------------------------
// Deliberately narrower than the API types. The model never invents ids (they
// are the gate's handles, so the server owns them) and never reports character
// offsets (models are unreliable at them — the server locates each span by
// searching for `original`, and drops any suggestion it cannot find).

export const ModelEdit = z.object({
  type: z.enum([
    'typo',
    'spacing',
    'punctuation',
    'grammar',
    'word-choice',
    'register',
  ]),
  /** Exact substring of the sentence being replaced. Must match verbatim. */
  original: z.string(),
  replacement: z.string(),
  /** One short line explaining the change. */
  reason: z.string(),
});
export type ModelEdit = z.infer<typeof ModelEdit>;

export const ModelProposal = z.object({
  sentences: z.array(
    z.object({
      index: z.number().int(),
      edits: z.array(ModelEdit),
    }),
  ),
});
export type ModelProposal = z.infer<typeof ModelProposal>;

export const SILENT_TYPES: ReadonlySet<string> = new Set([
  'typo',
  'spacing',
  'punctuation',
]);
