import { z } from 'zod';
import { ApiError } from './errors';
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

// --- Streaming ----------------------------------------------------------------
// `/propose/stream` sends these as NDJSON, one per line, while the model is
// still generating. They exist so the reader sees work on their own words in
// about a second instead of watching a spinner for six.
//
// The gate has to survive being streamed. Offsets are not settled until every
// silent fix has been applied, so nothing here carries one: these events are a
// progressive *preview*, and `done` carries the same authoritative payload the
// non-streaming route returns. A bug in the preview can therefore make the
// wait less informative, but it cannot corrupt what the reader ends up
// reviewing.

/**
 * A tier-1 fix, as it lands. Safe in full: the reader sees these in the diff
 * anyway.
 *
 * No `note`. A streamed string can arrive half-written, and a preview that
 * flashes the first few words of an explanation and then never completes it is
 * worse than one that shows only the change. The note arrives with `done`.
 */
export const StreamedFix = z.object({
  kind: z.literal('fix'),
  sentence: z.number().int(),
  type: SilentFixType,
  original: z.string(),
  replacement: z.string(),
});
export type StreamedFix = z.infer<typeof StreamedFix>;

/**
 * A tier-2 suggestion, as it lands.
 *
 * `original` is the reader's own words, so echoing it gives nothing away.
 * There is no `replacement` and no `reason` — the gate is the same here as it
 * is in `ProposeResponse`, and it is enforced the same way: by the field not
 * existing rather than by a flag saying not to look.
 */
export const StreamedGate = z.object({
  kind: z.literal('gate'),
  sentence: z.number().int(),
  type: GatedSuggestionType,
  original: z.string(),
  teaser: z.string(),
});
export type StreamedGate = z.infer<typeof StreamedGate>;

/** The real payload, once every span has a settled offset. */
export const StreamedDone = z.object({
  kind: z.literal('done'),
  response: ProposeResponse,
});
export type StreamedDone = z.infer<typeof StreamedDone>;

/**
 * A failure after the response has begun.
 *
 * The status line is long gone by then, so the error has to travel in the body
 * like everything else. Same shape the non-streaming route returns, so the
 * client branches on `code` either way.
 */
export const StreamedError = z.object({
  kind: z.literal('error'),
  error: ApiError,
});
export type StreamedError = z.infer<typeof StreamedError>;

export const ProposeStreamEvent = z.discriminatedUnion('kind', [
  StreamedFix,
  StreamedGate,
  StreamedDone,
  StreamedError,
]);
export type ProposeStreamEvent = z.infer<typeof ProposeStreamEvent>;

/** What the gate says without saying it. Shared so the stream and the final payload agree. */
export const TEASERS: Record<GatedSuggestionType, string> = {
  grammar: 'grammar fix available',
  'word-choice': 'stronger word available',
  register: 'register could be more academic',
};
