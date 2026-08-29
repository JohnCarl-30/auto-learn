import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CardRequest, type CardResponse } from '@auto-learn/shared';
import { RATE_LIMITS } from '../common/rate-limit';
import { ZodBody } from '../common/zod.pipe';
import { CardService } from './card.service';

@Controller('card')
export class CardController {
  constructor(private readonly service: CardService) {}

  // Looser than /propose: opening every gate in a paste is the good case,
  // and a limit that punishes it would be limiting engagement itself.
  @Throttle({ default: RATE_LIMITS.card })
  @Post()
  build(
    @Body(new ZodBody(CardRequest)) body: CardRequest,
  ): Promise<CardResponse> {
    return this.service.build(body);
  }

  /**
   * The same card, sent as it is written.
   *
   * Everything that can refuse — an expired session, a word the dictionary
   * does not carry — runs in `prepare` before a byte goes out, so those stay
   * ordinary status codes. A grammar note and a cache hit are answers already
   * and arrive as a single `done` line, which keeps one shape on the wire
   * whatever happened behind it.
   */
  @Throttle({ default: RATE_LIMITS.card })
  @Post('stream')
  async stream(
    @Body(new ZodBody(CardRequest)) body: CardRequest,
    @Res() res: Response,
  ): Promise<void> {
    const prepared = await this.service.prepare(body);

    // A reader who closes the card should stop paying for the rest of it.
    const abandoned = new AbortController();
    res.on('close', () => abandoned.abort());

    // Nothing was created; this is the same read the route above serves.
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    for await (const event of this.service.stream(prepared, abandoned.signal)) {
      if (res.writableEnded) break;
      res.write(`${JSON.stringify(event)}\n`);
    }

    res.end();
  }
}
