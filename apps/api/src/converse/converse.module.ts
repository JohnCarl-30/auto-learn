import { Module } from '@nestjs/common';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { ProposeModule } from '../propose/propose.module';
import { ConverseController } from './converse.controller';
import { ConverseService } from './converse.service';

@Module({
  imports: [ProposeModule, DictionaryModule],
  controllers: [ConverseController],
  providers: [ConverseService],
})
export class ConverseModule {}
