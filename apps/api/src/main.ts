import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

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
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY is not set.');
    logger.warn('  /propose and word cards will return 502 until it is.');
    logger.warn('  Copy apps/api/.env.example to apps/api/.env and add a key.');
    logger.warn('  Grammar notes, the sentence cap and validation still work.');
  }

  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    logger.warn('ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is not set.');
    logger.warn('  Dictation and synthesised pronunciation return 502.');
    logger.warn('  Words the dictionary has a recording for still play,');
    logger.warn('  and every card still shows its written pronunciation.');
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  checkApiKeys(logger);

  // Rate limiting keys on the client IP, and behind a hosted load balancer
  // every request arrives carrying the proxy's address instead — which would
  // make one caller's burst exhaust the limit for everybody. One hop, because
  // trusting the whole chain lets a client name its own address in
  // X-Forwarded-For and step around the limit entirely.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}
void bootstrap();
