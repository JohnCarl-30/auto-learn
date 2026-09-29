import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { CallerGuard } from './caller.guard';

/**
 * Note what is not here: the guard is a provider, not an APP_GUARD.
 *
 * Every route this API has is deliberately open — a writer fixes a sentence
 * without an account, which is the product working as intended. Identity is
 * opt-in per route, applied where a route is about somebody's own data. Making
 * it global would break the product's front door.
 */
@Module({
  controllers: [AuthController],
  providers: [CallerGuard],
  exports: [CallerGuard],
})
export class AuthModule {}
