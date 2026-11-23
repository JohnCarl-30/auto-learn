import { Hono } from 'hono';
import { LessonFeedbackRequest, LessonWordRequest } from '@auto-learn/shared';
import { signedIn } from '../auth/auth.middleware';
import { rateLimit } from '../common/rate-limit';
import { body } from '../common/zod.pipe';
import type { LessonService } from './lesson.service';

export function lessonRoutes(service: LessonService) {
  return (
    new Hono()
      .use(signedIn)
      /** A new word for the unit. Null rather than an error when none is found. */
      .post('/word', rateLimit('lessonWord'), async (c) =>
        c.json(await service.suggestWord(await body(c.req, LessonWordRequest))),
      )
      /** JSON, not a stream: the verdict is one object the page shows whole. */
      .post('/feedback', rateLimit('lesson'), async (c) =>
        c.json(
          await service.feedback(await body(c.req, LessonFeedbackRequest)),
        ),
      )
  );
}
