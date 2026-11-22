import { Logger } from './common/http';
import { signInRequired } from './auth/signed-in.guard';

/**
 * Without a key the calls that need it fail at request time as a 502, which
 * reads like a bug in the app rather than a missing setup step. Say so at boot.
 *
 * These warn rather than exit on purpose: every deterministic path — the
 * sentence cap, request validation, dictionary lookups, grammar notes, and the
 * dictionary's own pronunciation recordings — works without any key at all,
 * and those are worth being able to run.
 */
function checkApiKeys(logger: Logger): void {
  if (
    !process.env.ANTHROPIC_API_KEY &&
    !process.env.ANTHROPIC_AUTH_TOKEN &&
    !process.env.OLLAMA_MODEL
  ) {
    logger.warn('ANTHROPIC_API_KEY is not set (nor OLLAMA_MODEL).');
    logger.warn('  /propose and word cards will return 502 until it is.');
    logger.warn('  Copy apps/api/.env.example to apps/api/.env and add a key.');
    logger.warn('  Grammar notes, the sentence cap and validation still work.');
  }

  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    logger.warn('ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is not set.');
    logger.warn('  Synthesised pronunciation returns 502.');
    logger.warn('  Dictation does not need it: with no ElevenLabs key it');
    logger.warn('  transcribes with OpenAI instead, if OPENAI_API_KEY is set.');
    logger.warn('  Words the dictionary has a recording for still play,');
    logger.warn('  and every card still shows its written pronunciation.');
  }
}

/** What this deploy will and will not do, said once when the process starts. */
export function logBootState(): void {
  const logger = new Logger('Bootstrap');

  checkApiKeys(logger);

  // Whether the key-spending routes are behind sign-in is the one setting that
  // decides who can run up the bill, so it is stated at boot rather than
  // inferred from a 401 later.
  if (signInRequired()) {
    logger.log(
      'REQUIRE_SIGN_IN is on: only signed-in callers can use the model routes.',
    );
    if (!process.env.API_JWT_SECRET) {
      logger.warn(
        '  API_JWT_SECRET is not set, so every one of those requests will be refused.',
      );
    }
  } else {
    logger.log(
      'REQUIRE_SIGN_IN is off: the model routes are open to anyone who can reach this API.',
    );
    // The lock fails open on anything but the exact string, so a near-miss such
    // as "TRUE" or "1" would otherwise leave a public deploy unlocked in silence.
    if (process.env.REQUIRE_SIGN_IN) {
      logger.warn(
        `  REQUIRE_SIGN_IN is set to "${process.env.REQUIRE_SIGN_IN}", so the lock is OFF. Only the exact value "true" turns it on.`,
      );
    }
  }
}
