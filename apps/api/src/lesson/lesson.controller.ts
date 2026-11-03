import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  LessonFeedbackRequest,
  LessonWordRequest,
  type LessonFeedbackResponse,
  type SessionWordResponse,
} from '@auto-learn/shared';
import { SignedInGuard } from '../auth/signed-in.guard';
import { RATE_LIMITS } from '../common/rate-limit';
import { ZodBody } from '../common/zod.pipe';
import { LessonService } from './lesson.service';

@Controller('lesson')
@UseGuards(SignedInGuard)
export class LessonController {
  constructor(private readonly service: LessonService) {}

  /** A new word for the unit. Null rather than an error when none is found. */
  @Throttle({ default: RATE_LIMITS.lessonWord })
  @Post('word')
  // Nothing was created; this is a read, like /converse/word.
  @HttpCode(200)
  word(
    @Body(new ZodBody(LessonWordRequest)) body: LessonWordRequest,
  ): Promise<SessionWordResponse> {
    return this.service.suggestWord(body);
  }

  /** JSON, not a stream: the verdict is one object the page shows whole. */
  @Throttle({ default: RATE_LIMITS.lesson })
  @Post('feedback')
  @HttpCode(200)
  feedback(
    @Body(new ZodBody(LessonFeedbackRequest)) body: LessonFeedbackRequest,
  ): Promise<LessonFeedbackResponse> {
    return this.service.feedback(body);
  }
}
