/**
 * Model choice, prices and per-call options — deliberately free of any SDK
 * import, so `evals/` and anything else can read the data without loading a
 * provider. Data here, wiring in `models.ts` and `claude.ts`.
 *
 * Two calls with opposite priorities.
 *
 * PROPOSE runs on every submission with the user watching a spinner, so it
 * runs with thinking off. CARD fires only after the user has committed by
 * opening a gate, so it can afford to think — and it is the artifact the
 * product exists to deliver, where a wrong nuance claim teaches a learner
 * something false.
 *
 * Both are Claude Haiku 5.5, chosen for cost: the two calls differ in how
 * much they think (the options below), not in model.
 *
 * Cached input is 90% off, which is why the system prompts are constants in
 * `prompts.ts` and never interpolate per-request values.
 */
export const PROPOSE_MODEL = 'claude-haiku-5-5';
export const CARD_MODEL = 'claude-haiku-5-5';

/**
 * The speaking partner's reply. Same model as PROPOSE and for the same reason,
 * only more so: someone has just stopped talking and is waiting to be answered
 * out loud, and a pause of several seconds is where a conversation stops
 * feeling like one. The reply is a few sentences of small talk, which the
 * cheap tier writes as well as the expensive one.
 *
 * An alias rather than a second string, so it shares PROPOSE's price row and a
 * change to one is visibly a change to both.
 */
export const CONVERSE_MODEL = PROPOSE_MODEL;

/**
 * USD per 1M tokens. Code rather than a comment because `evals/` prices its
 * runs from this table — a number with a job gets noticed when it goes stale,
 * and a stale price silently misreports what a run cost.
 *
 * Haiku 5.5's rate for prompts up to 100K tokens; every prompt here is far
 * below that. Cache writes are billed as plain input (they cost 1.25x).
 */
export const MODEL_PRICES: Record<
  string,
  { input: number; cachedInput: number; output: number }
> = {
  'claude-haiku-5-5': { input: 0.1, cachedInput: 0.01, output: 0.5 },
  /** The evals' default judge (evals/src/judge.ts). */
  'claude-opus-5-5': { input: 4, cachedInput: 0.2, output: 20 },
};

/**
 * Output caps, exported for the same reason the prompts are: a truncated
 * generation is a different generation, so a harness that guessed this number
 * would be scoring a call production never makes.
 */
export const PROPOSE_MAX_OUTPUT_TOKENS = 2000;
/** A reply is one to three spoken sentences; anything near this cap is a monologue. */
export const CONVERSE_MAX_OUTPUT_TOKENS = 300;
/** Room for the card's thinking as well as the card: both count against this cap. */
export const CARD_MAX_OUTPUT_TOKENS = 4000;
/**
 * A lesson verdict is five short fields, a quote or two per part and up to
 * three filler notes, so this is room to spare for a three-part unit and no
 * room for an essay on someone's answer.
 */
export const LESSON_FEEDBACK_MAX_OUTPUT_TOKENS = 900;

/**
 * Failure policy for both calls.
 *
 * The SDK retries on its own but bounds nothing in wall-clock terms, so a
 * connection that opens and then stalls hangs the request until the platform
 * kills it — and the reader watches a spinner the whole time. The card call
 * gets longer because it reasons, and because by then the reader has committed
 * by opening a gate and would rather wait than lose it.
 */
export const MODEL_MAX_RETRIES = 2;

/**
 * One, for both voice routes.
 *
 * Someone is watching a button or holding a recording, and on those paths a
 * spinner that never resolves is worse than a failure that does. The speech
 * route already reasoned this way; transcription was taking the SDK's two by
 * omission rather than by choice.
 */
export const MODEL_MAX_RETRIES_VOICE = 1;
export const PROPOSE_TIMEOUT_MS = 30_000;
export const CARD_TIMEOUT_MS = 45_000;
/** Shorter than PROPOSE: the review runs beside it, and a reply this late is a dead conversation. */
export const CONVERSE_TIMEOUT_MS = 20_000;

/** How hard a call thinks. Read by `claude.ts`. */
export interface ClaudeOptions {
  effort: 'low' | 'medium' | 'high';
  /** Off for the calls someone is waiting on; Haiku accepts that at effort high or below. */
  thinking: boolean;
}

export const proposeProviderOptions: ClaudeOptions = {
  effort: 'low',
  thinking: false,
};

export const converseProviderOptions: ClaudeOptions = {
  effort: 'low',
  thinking: false,
};

export const sessionWordProviderOptions: ClaudeOptions = {
  effort: 'low',
  thinking: false,
};

export const lessonFeedbackProviderOptions: ClaudeOptions = {
  effort: 'low',
  thinking: false,
};

/** The one call that thinks, at the lowest effort: a card is short. */
export const cardProviderOptions: ClaudeOptions = {
  effort: 'low',
  thinking: true,
};

// --- Voice ------------------------------------------------------------------
// A different provider, and deliberately so: Claude is where the reasoning
// happens, ElevenLabs (or OpenAI's transcription) is where the speaking happens. Both go through the same
// AI SDK functions, so the vendor is these constants rather than an
// architecture — swapping back is this file and its wiring, and nothing else.

/**
 * Transcription sits where PROPOSE sits: someone is watching a spinner while
 * their own speech turns into text, so it takes the fast tier.
 */
export const TRANSCRIBE_MODEL = 'scribe_v2';

/**
 * What transcribes when ElevenLabs is not configured, which is the free-tier
 * deploy: the installed iPhone app cannot use the browser's speech recognition,
 * so it records and posts to /dictate, and that has to work on the OpenAI key
 * alone. The mini model because the audio is one short sentence and someone is
 * watching a spinner — the same reasoning as the fast tier above.
 */
export const OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';

/**
 * Speech does not: it fires on a click, for a single word, and the result is
 * cached for a week afterwards. The quality tier costs almost nothing at that
 * scale, and a mispronounced word teaches a learner something false — the same
 * reason CARD is allowed to think.
 */
export const SPEECH_MODEL = 'eleven_v3';

/**
 * From the environment rather than a constant, because a voice id is
 * account-scoped rather than universal: ElevenLabs' shared Default voices are
 * withdrawn at the end of 2026 and are unavailable to newer accounts already,
 * so a hardcoded id is a deployment that stops working on a date nobody
 * remembers choosing.
 */
export const speechVoice = () => process.env.ELEVENLABS_VOICE_ID ?? '';

/**
 * A local speech engine for the partner's replies — VoiceStudio, or anything
 * else that speaks OpenAI's audio API — e.g. http://localhost:3900/v1. Unset,
 * the browser's own voice reads them. Nothing here costs a key, which is why
 * /speak may take a whole sentence on this path and never on ElevenLabs'.
 */
export const voiceStudioUrl = () => process.env.VOICE_STUDIO_URL ?? '';

export const transcribeProviderOptions = {
  elevenlabs: {
    /**
     * The important one. Left to auto-detect, a strongly accented English
     * utterance can be identified as another language and come back
     * *translated* rather than transcribed — silently, and worst for exactly
     * the learners this product is for.
     */
    languageCode: 'en',
    /**
     * Off, or the transcript arrives with "[laughter]" and "[background
     * noise]" in it — annotations that are useful for captioning and are
     * vandalism inside someone's draft sentence.
     */
    tagAudioEvents: false,
    // One person dictating one sentence: no speakers to separate, no timings
    // to carry. Both cost tokens and neither is ever read.
    diarize: false,
    timestampsGranularity: 'none',
  },
  // Each provider reads only its own key, so both sets ride along and
  // `transcribeModel()` decides which applies. The same hazard as above, on the
  // path the deployed site actually uses: unpinned, accented English can come
  // back translated rather than transcribed.
  openai: { language: 'en' },
} as const;

export const SPEECH_OUTPUT_FORMAT = 'mp3_22050_32';

export const speechProviderOptions = {
  elevenlabs: {
    languageCode: 'en',
    /**
     * Fixed so that a word re-synthesised after falling out of the cache comes
     * back identical. Without it the same word drifts between renderings, and
     * a learner who replays it hears something subtly different each time.
     */
    seed: 20260821,
  },
} as const;
