import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { TelemetryEvent, type TelemetrySnapshot } from '@auto-learn/shared';
import { ZodBody } from '../common/zod.pipe';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  /**
   * Everything the server cannot see for itself.
   *
   * Taking a suggestion and recalling a word both happen entirely in the
   * browser — the second one against a bank the server has never held a copy
   * of — so the client is the only thing that can report either.
   */
  @Post()
  @HttpCode(204)
  record(@Body(new ZodBody(TelemetryEvent)) body: TelemetryEvent): void {
    const record: Record<TelemetryEvent['event'], () => void> = {
      suggestion_accepted: () => this.telemetry.accepted(),
      suggestion_rejected: () => this.telemetry.rejected(),
      drill_started: () => this.telemetry.drillStarted(),
      drill_finished: () => this.telemetry.drillFinished(),
      word_recalled: () => this.telemetry.wordRecalled(),
      word_forgotten: () => this.telemetry.wordForgotten(),
    };

    record[body.event]();
  }

  @Get()
  snapshot(): TelemetrySnapshot {
    return this.telemetry.snapshot();
  }
}
