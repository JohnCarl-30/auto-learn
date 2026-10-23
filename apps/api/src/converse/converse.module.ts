import { Module } from '@nestjs/common';
import { ProposeModule } from '../propose/propose.module';
import { ConverseController } from './converse.controller';
import { ConverseService } from './converse.service';

@Module({
  imports: [ProposeModule],
  controllers: [ConverseController],
  providers: [ConverseService],
})
export class ConverseModule {}
