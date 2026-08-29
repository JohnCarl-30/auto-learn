import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiThrottlerGuard, RATE_LIMITS } from './common/rate-limit';
import { HealthModule } from './health/health.module';
import { SessionModule } from './session/session.module';
import { ProposeModule } from './propose/propose.module';
import { CardModule } from './card/card.module';
import { SpeechModule } from './speech/speech.module';
import { DictateModule } from './dictate/dictate.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rather than per-controller: a new route should arrive limited,
    // and opt out on purpose rather than by being forgotten.
    ThrottlerModule.forRoot([{ ...RATE_LIMITS.default }]),
    HealthModule,
    TelemetryModule,
    SessionModule,
    ProposeModule,
    CardModule,
    SpeechModule,
    DictateModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiThrottlerGuard }],
})
export class AppModule {}
