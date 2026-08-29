import { Module } from '@nestjs/common';
import { DictateController } from './dictate.controller';
import { DictateService } from './dictate.service';

@Module({
  controllers: [DictateController],
  providers: [DictateService],
})
export class DictateModule {}
