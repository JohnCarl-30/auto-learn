import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ProposeRequest, type ProposeResponse } from '@auto-learn/shared';
import { RATE_LIMITS } from '../common/rate-limit';
import { ZodBody } from '../common/zod.pipe';
import { ProposeService } from './propose.service';

@Controller('propose')
export class ProposeController {
  constructor(private readonly service: ProposeService) {}

  /** The most expensive route here: one paste, one model call. */
  @Throttle({ default: RATE_LIMITS.propose })
  @Post()
  propose(
    @Body(new ZodBody(ProposeRequest)) body: ProposeRequest,
  ): Promise<ProposeResponse> {
    return this.service.propose(body);
  }

  /**
   * The same work, sent as it happens.
   *
   * NDJSON rather than SSE because this is a POST — the text is the request
   * body, and EventSource only issues GETs. One JSON object per line is what a
   * fetch reader can split on without a protocol.
   *
   * Shares the propose limit deliberately: it is the same model call, and a
   * separate allowance would be a second door to the same spend.
   */
  @Throttle({ default: RATE_LIMITS.propose })
  @Post('stream')
  async stream(
    @Body(new ZodBody(ProposeRequest)) body: ProposeRequest,
    @Res() res: Response,
  ): Promise<void> {
    // Runs first, and throws: an empty or over-cap paste is refused with a
    // status code, the way it is on the route above. Once a byte of the body
    // is out that option is gone for good.
    const sentences = this.service.prepare(body);

    // A reader who closes the tab should stop costing money mid-generation.
    const abandoned = new AbortController();
    res.on('close', () => abandoned.abort());

    // Nest answers a POST with 201 by default. Nothing was created here —
    // this is the same read the route above serves, delivered differently.
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    // Proxies buffer by default, and a buffered stream is just a slower
    // version of the route above.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    for await (const event of this.service.stream(
      body,
      sentences,
      abandoned.signal,
    )) {
      if (res.writableEnded) break;
      res.write(`${JSON.stringify(event)}\n`);
    }

    res.end();
  }
}
