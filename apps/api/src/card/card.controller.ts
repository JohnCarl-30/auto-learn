import { Body, Controller, Post } from '@nestjs/common';
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
}
