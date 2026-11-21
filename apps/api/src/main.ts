import { serve } from '@hono/node-server';
import { Logger } from './common/http';
import app from './index';

/** Local development and any host that runs a long-lived Node process. */
const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () =>
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}`),
);
