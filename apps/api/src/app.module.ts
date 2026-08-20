import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiThrottlerGuard, RATE_LIMITS } from './common/rate-limit';
import { SessionModule } from './session/session.module';
import { ProposeModule } from './propose/propose.module';
import { CardModule } from './card/card.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rather than per-controller: a new route should arrive limited,
    // and opt out on purpose rather than by being forgotten.
    ThrottlerModule.forRoot([{ ...RATE_LIMITS.default }]),
    TelemetryModule,
    SessionModule,
    ProposeModule,
    CardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiThrottlerGuard }],
})
export class AppModule {}
