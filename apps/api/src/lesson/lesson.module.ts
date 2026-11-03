import { Module } from '@nestjs/common';
import { ConverseModule } from '../converse/converse.module';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { ProposeModule } from '../propose/propose.module';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';

/**
 * Borrows rather than copies: the rewrite is `ProposeService` (same prompt, same
 * gate, same session), the word check is `ConverseService`'s, and the word's
 * pronunciation is the card's `DictionaryService` lookup. TelemetryService
 * is not imported because its module is global.
 */
@Module({
  imports: [ProposeModule, ConverseModule, DictionaryModule],
  controllers: [LessonController],
  providers: [LessonService],
})
export class LessonModule {}
