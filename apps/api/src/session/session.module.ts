import { Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { MemorySessionStore, SessionStore } from './session.store';
import { RedisSessionStore } from './redis-session.store';

/**
 * Which store, decided once at boot.
 *
 * In memory unless REDIS_URL says otherwise, so a checkout with no
 * infrastructure runs, and the tests keep testing the logic rather than a
 * connection. Set the variable and the same application scales past one
 * instance and stops losing reviews on restart.
 */
function createSessionStore(): SessionStore {
  const logger = new Logger(SessionModule.name);
  const url = process.env.REDIS_URL;

  if (!url) {
    logger.log(
      'Sessions in memory. One API instance only; a restart drops them.',
    );
    return new MemorySessionStore();
  }

  logger.log('Sessions in Redis.');
  return new RedisSessionStore(
    new Redis(url, {
      // A session lookup that hangs is worse than one that fails: the reader
      // is holding an open card waiting for a wording, and "that session has
      // expired" is at least an answer they can act on.
      connectTimeout: 3_000,
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    }),
  );
}

@Global()
@Module({
  providers: [{ provide: SessionStore, useFactory: createSessionStore }],
  exports: [SessionStore],
})
export class SessionModule {}
