import { Hono } from 'hono';
import { ConverseRequest, SessionWordRequest } from '@auto-learn/shared';
import { signedIn } from '../auth/auth.middleware';
import { rateLimit } from '../common/rate-limit';
import { body } from '../common/zod.pipe';
import type { ConverseService } from './converse.service';

export function converseRoutes(service: ConverseService) {
  return (
    new Hono()
      .use(signedIn)
      /**
       * JSON, not a stream. The reply is a few sentences that are spoken as a
       * whole once they arrive, so there is nothing for a reader to watch being
       * written — and the review beside it has its own gate to keep, which the
       * finished payload already keeps.
       */
      .post('/', rateLimit('converse'), async (c) =>
        c.json(await service.converse(await body(c.req, ConverseRequest))),
      )
      /** A word to practise this conversation. Null rather than an error when none is found. */
      .post('/word', rateLimit('sessionWord'), async (c) =>
        c.json(
          await service.suggestWord(await body(c.req, SessionWordRequest)),
        ),
      )
  );
}
