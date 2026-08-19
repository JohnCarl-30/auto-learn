import { Body, Controller, Post } from '@nestjs/common';
import { ProposeRequest, type ProposeResponse } from '@auto-learn/shared';
import { ZodBody } from '../common/zod.pipe';
import { ProposeService } from './propose.service';

@Controller('propose')
export class ProposeController {
  constructor(private readonly service: ProposeService) {}

  @Post()
  propose(
    @Body(new ZodBody(ProposeRequest)) body: ProposeRequest,
  ): Promise<ProposeResponse> {
    return this.service.propose(body);
  }
}
