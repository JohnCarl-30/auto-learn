import { Body, Controller, Post } from '@nestjs/common';
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
}
