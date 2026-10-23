import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConverseRequest, type ConverseResponse } from '@auto-learn/shared';
import { RATE_LIMITS } from '../common/rate-limit';
import { ZodBody } from '../common/zod.pipe';
import { ConverseService } from './converse.service';

@Controller('converse')
export class ConverseController {
  constructor(private readonly service: ConverseService) {}

  /**
   * JSON, not a stream. The reply is a few sentences that are spoken as a
   * whole once they arrive, so there is nothing for a reader to watch being
   * written — and the review beside it has its own gate to keep, which the
   * finished payload already keeps.
   */
  @Throttle({ default: RATE_LIMITS.converse })
  @Post()
  // Nothing was created; this is a reply, the way /propose's stream is a read.
  @HttpCode(200)
  converse(
    @Body(new ZodBody(ConverseRequest)) body: ConverseRequest,
  ): Promise<ConverseResponse> {
    return this.service.converse(body);
  }
}
