import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The API's `.env` is the one that already holds the keys and the model
 * choice, and asking someone to keep a second copy in sync is asking for an
 * eval run against a key that expired six weeks ago. Nothing already in the
 * environment is overwritten.
 */
export function loadApiEnv(): void {
  const path = fileURLToPath(new URL('../../apps/api/.env', import.meta.url));
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (key && !process.env[key]) {
      process.env[key] = raw!.trim().replace(/^["']|["']$/g, '');
    }
  }
}
