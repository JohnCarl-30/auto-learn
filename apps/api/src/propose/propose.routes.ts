import { Hono } from 'hono';
import { ProposeRequest } from '@auto-learn/shared';
import { signedIn } from '../auth/auth.middleware';
import { ndjson } from '../common/ndjson';
import { rateLimit } from '../common/rate-limit';
import { body } from '../common/zod.pipe';
import type { ProposeService } from './propose.service';

export function proposeRoutes(service: ProposeService) {
  return (
    new Hono()
      // The most expensive routes here: one paste, one model call. The stream
      // shares the allowance deliberately — it is the same model call, and a
      // separate one would be a second door to the same spend.
      .use(signedIn, rateLimit('propose'))
      // 201: what these POSTs have always answered, so clients see no change.
      .post('/', async (c) =>
        c.json(await service.propose(await body(c.req, ProposeRequest)), 201),
      )
      /** The same work, sent as it happens. */
      .post('/stream', async (c) => {
        const request = await body(c.req, ProposeRequest);
        // Runs first, and throws: an empty or over-cap paste is refused with a
        // status code, the way it is on the route above.
        const sentences = service.prepare(request);
        return ndjson(c, (signal) =>
          service.stream(request, sentences, signal),
        );
      })
  );
}
