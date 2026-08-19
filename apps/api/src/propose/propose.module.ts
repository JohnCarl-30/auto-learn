import { Module } from '@nestjs/common';
import { ProposeController } from './propose.controller';
import { ProposeService } from './propose.service';

@Module({
  controllers: [ProposeController],
  providers: [ProposeService],
})
export class ProposeModule {}
