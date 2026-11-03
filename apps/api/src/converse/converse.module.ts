import { Module } from '@nestjs/common';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { ProposeModule } from '../propose/propose.module';
import { ConverseController } from './converse.controller';
import { ConverseService } from './converse.service';

@Module({
  imports: [ProposeModule, DictionaryModule],
  controllers: [ConverseController],
  providers: [ConverseService],
  // The daily lesson picks its word through the same check — new to the learner,
  // known to WordNet — rather than a copy of it.
  exports: [ConverseService],
})
export class ConverseModule {}
