import { createApp } from './create-app';
import { logBootState } from './boot';

logBootState();

/** The entry Vercel's Hono support looks for: a default-exported app. */
const app = createApp();
export default app;
