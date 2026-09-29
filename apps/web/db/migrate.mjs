/**
 * Applies db/schema.sql.
 *
 * Deliberately not a migration framework. There is one file, it is idempotent,
 * and it is run by hand or by the deploy script — a versions table and a
 * directory of numbered diffs would be more machinery than four tables that
 * belong to a library have earned. When the first table of our own arrives and
 * needs altering rather than creating, that is the moment to reach for one.
 *
 * Run: pnpm --filter web db:migrate
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

/**
 * Loads the env files Next.js would load, because this is not Next.js.
 *
 * `next dev` reads .env.local for you; plain node does not, so the command the
 * README gives — `pnpm --filter web db:migrate` — would have reported a missing
 * DATABASE_URL that was sitting in a file two directories up. Real environment
 * variables win, which is what makes this a no-op on a deploy that sets them.
 */
for (const file of ['.env.local', '.env']) {
  const path = join(web, file);
  if (!existsSync(path)) continue;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line);
    if (!match || line.trimStart().startsWith('#')) continue;

    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.trim().replace(/^["']|["']$/g, '');
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'DATABASE_URL is not set. Sign-in needs a Postgres to keep users and\n' +
      'single-use magic links in. For local work:\n\n' +
      '  createdb auto_learn\n' +
      '  DATABASE_URL=postgres://localhost/auto_learn pnpm --filter web db:migrate\n',
  );
  process.exit(1);
}

const schema = readFileSync(join(here, 'schema.sql'), 'utf8');

const client = new pg.Client({
  connectionString: url,
  // Managed Postgres is almost always TLS with a certificate this client has no
  // root for. Plain `sslmode=require` in the URL is not enough on its own.
  ssl: url.includes('localhost') || url.includes('127.0.0.1')
    ? undefined
    : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(schema);
  console.log('Schema applied.');
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
