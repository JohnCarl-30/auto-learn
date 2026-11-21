import { Hono } from 'hono';
import { TelemetryEvent } from '@auto-learn/shared';
import { rateLimit } from '../common/rate-limit';
import { body } from '../common/zod.pipe';
import type { TelemetryService } from './telemetry.service';

export function telemetryRoutes(telemetry: TelemetryService) {
  return (
    new Hono()
      .use(rateLimit('default'))
      /**
       * Everything the server cannot see for itself.
       *
       * Taking a suggestion and recalling a word both happen entirely in the
       * browser — the second one against a bank the server has never held a copy
       * of — so the client is the only thing that can report either.
       */
      .post('/', async (c) => {
        const { event } = await body(c.req, TelemetryEvent);
        const record: Record<TelemetryEvent['event'], () => void> = {
          suggestion_accepted: () => telemetry.accepted(),
          suggestion_rejected: () => telemetry.rejected(),
          drill_started: () => telemetry.drillStarted(),
          drill_finished: () => telemetry.drillFinished(),
          word_recalled: () => telemetry.wordRecalled(),
          word_forgotten: () => telemetry.wordForgotten(),
          said_back_matched: () => telemetry.saidBackMatched(),
          said_back_missed: () => telemetry.saidBackMissed(),
        };
        record[event]();
        return c.body(null, 204);
      })
      .get('/', (c) => c.json(telemetry.snapshot()))
  );
}
