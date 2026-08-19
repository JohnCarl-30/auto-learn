import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionModule } from './session/session.module';
import { ProposeModule } from './propose/propose.module';
import { CardModule } from './card/card.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TelemetryModule,
    SessionModule,
    ProposeModule,
    CardModule,
  ],
})
export class AppModule {}
