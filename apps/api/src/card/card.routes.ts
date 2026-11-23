import { Hono } from 'hono';
import { CardRequest } from '@auto-learn/shared';
import { signedIn } from '../auth/auth.middleware';
import { ndjson } from '../common/ndjson';
import { rateLimit } from '../common/rate-limit';
import { body } from '../common/zod.pipe';
import type { CardService } from './card.service';

export function cardRoutes(service: CardService) {
  return (
    new Hono()
      // Looser than /propose: opening every gate in a paste is the good case,
      // and a limit that punishes it would be limiting engagement itself.
      .use(signedIn, rateLimit('card'))
      // 201, as Nest answered every POST without an explicit code.
      .post('/', async (c) =>
        c.json(await service.build(await body(c.req, CardRequest)), 201),
      )
      /**
       * The same card, sent as it is written.
       *
       * Everything that can refuse — an expired session, a word the dictionary
       * does not carry — runs in `prepare` before a byte goes out, so those stay
       * ordinary status codes. A grammar note and a cache hit are answers already
       * and arrive as a single `done` line, which keeps one shape on the wire
       * whatever happened behind it.
       */
      .post('/stream', async (c) => {
        const prepared = await service.prepare(await body(c.req, CardRequest));
        // A reader who closes the card should stop paying for the rest of it.
        return ndjson(c, (signal) => service.stream(prepared, signal));
      })
  );
}
