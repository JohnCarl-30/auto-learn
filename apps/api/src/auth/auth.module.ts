import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { CallerGuard } from './caller.guard';

/**
 * Note what is not here: the guard is a provider, not an APP_GUARD.
 *
 * By default every route this API has is open — a writer fixes a sentence
 * without an account, which is the product working as intended. Identity is
 * opt-in per route, applied where a route is about somebody's own data. Making
 * it global would break the product's front door.
 *
 * The one exception is a deploy's choice, not this module's: with
 * `REQUIRE_SIGN_IN=true`, `SignedInGuard` (applied per controller, on the
 * routes that spend the OpenAI key) refuses callers without a token. See
 * signed-in.guard.ts.
 */
@Module({
  controllers: [AuthController],
  providers: [CallerGuard],
  exports: [CallerGuard],
})
export class AuthModule {}
