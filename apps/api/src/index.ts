import { Hono } from 'hono';
import { createApp } from './create-app';
import { logBootState } from './boot';

logBootState();

/**
 * The entry Vercel's Hono support looks for: a default-exported app, built in
 * this file because its detection only accepts an entry that imports `hono`.
 */
const app = new Hono().route('/', createApp());
export default app;
