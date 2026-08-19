import { Body, Controller, Post } from '@nestjs/common';
import { CardRequest, type CardResponse } from '@auto-learn/shared';
import { ZodBody } from '../common/zod.pipe';
import { CardService } from './card.service';

@Controller('card')
export class CardController {
  constructor(private readonly service: CardService) {}

  @Post()
  build(
    @Body(new ZodBody(CardRequest)) body: CardRequest,
  ): Promise<CardResponse> {
    return this.service.build(body);
  }
}
