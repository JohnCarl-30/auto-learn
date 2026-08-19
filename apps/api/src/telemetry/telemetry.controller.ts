import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { TelemetryEvent, type TelemetrySnapshot } from '@auto-learn/shared';
import { ZodBody } from '../common/zod.pipe';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  /** Accept and reject happen in the browser, so the client reports them. */
  @Post()
  @HttpCode(204)
  record(@Body(new ZodBody(TelemetryEvent)) body: TelemetryEvent): void {
    if (body.event === 'suggestion_accepted') this.telemetry.accepted();
    else this.telemetry.rejected();
  }

  @Get()
  snapshot(): TelemetrySnapshot {
    return this.telemetry.snapshot();
  }
}
