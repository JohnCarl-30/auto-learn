import 'server-only';
import { Pool } from 'pg';

/**
 * One pool for the process.
 *
 * Kept on `globalThis` because `next dev` re-evaluates modules on every edit,
 * and a fresh pool per reload exhausts a small Postgres' connection limit
 * within a few saves. Production evaluates once and the branch never runs.
 */
const globalForDb = globalThis as unknown as { authPool?: Pool };

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    // Loud, and at call time rather than import time: the rest of the product
    // works without a database, and a missing one should break signing in
    // rather than the page someone is writing a sentence on.
    throw new Error(
      'DATABASE_URL is not set, so there is nowhere to keep accounts.',
    );
  }
  return value;
}

export function pool(): Pool {
  if (globalForDb.authPool) return globalForDb.authPool;

  const connectionString = url();
  const created = new Pool({
    connectionString,
    // A hosted Postgres presents a certificate chain this client has no root
    // for; a local one has no TLS at all.
    ssl:
      connectionString.includes('localhost') ||
      connectionString.includes('127.0.0.1')
        ? undefined
        : { rejectUnauthorized: false },
    // Small on purpose. Sign-in is a handful of queries at the start of a
    // session, not a read path, and serverless platforms multiply pools by
    // instance rather than sharing one.
    max: 5,
    idleTimeoutMillis: 30_000,
  });

  globalForDb.authPool = created;
  return created;
}

/**
 * A pool-shaped object that connects on first query rather than on import.
 *
 * `next build` imports every route module to collect page data, and the Auth.js
 * adapter is constructed where `auth.ts` is imported — so building took a live
 * DATABASE_URL, and CI, which has none, failed at "Collecting page data for
 * /api/auth/[...nextauth]". Deferring the pool means the build only needs the
 * module to load, and a request is the first thing that needs a database.
 *
 * The cast is narrow and checked: @auth/pg-adapter touches nothing on what it is
 * given except `query`, which its source makes plain — every one of its
 * operations is a `client.query(sql, params)`. If a future version reaches for
 * `connect` or `end`, this throws immediately and loudly rather than misbehaving.
 */
export function lazyPool(): Pool {
  return {
    query: (...args: Parameters<Pool['query']>) => pool().query(...args),
  } as Pool;
}
