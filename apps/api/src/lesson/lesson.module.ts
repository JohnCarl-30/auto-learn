import { Module } from '@nestjs/common';
import { ConverseModule } from '../converse/converse.module';
import { ProposeModule } from '../propose/propose.module';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';

/**
 * Borrows rather than copies: the rewrite is `ProposeService` (same prompt, same
 * gate, same session) and the word check is `ConverseService`'s. TelemetryService
 * is not imported because its module is global.
 */
@Module({
  imports: [ProposeModule, ConverseModule],
  controllers: [LessonController],
  providers: [LessonService],
})
export class LessonModule {}
