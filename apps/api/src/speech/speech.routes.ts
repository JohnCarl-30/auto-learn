import { Hono } from 'hono';
import { SpeakReply, SpeakWord } from '@auto-learn/shared';
import { signedIn } from '../auth/auth.middleware';
import { rateLimit } from '../common/rate-limit';
import { body, parseOr400 } from '../common/zod.pipe';
import type { SpeechService } from './speech.service';

export function speechRoutes(service: SpeechService) {
  return (
    new Hono()
      .use(signedIn, rateLimit('speak'))
      /**
       * A GET, because saying a word is a pure read of something keyed entirely by
       * that word — no session, no side effects, the same answer for everybody.
       *
       * That is worth more than it looks: it lets the browser keep the audio across
       * page loads and sessions for free, which is the whole reason there is no
       * client-side audio store to build and keep migrated.
       *
       * The header is set after the call returns, and that matters: an explicit
       * `max-age` makes even a 502 cacheable, so a single bad minute at the
       * provider would leave that word silent for a day in every browser that
       * asked during it. Only answers worth keeping are kept.
       */
      .get('/:word', async (c) => {
        const spoken = await service.speak(
          parseOr400(SpeakWord, c.req.param('word')),
        );
        c.header('Cache-Control', 'public, max-age=86400');
        return c.json(spoken);
      })
      /**
       * A whole reply, for the partner's voice. A POST with no caching: unlike a
       * word, a reply is its own and said once. Only a local engine answers it.
       */
      .post('/', async (c) =>
        c.json(await service.speakReply((await body(c.req, SpeakReply)).text)),
      )
  );
}
