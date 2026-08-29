import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DictionaryEntry } from './scorers/card';

export const DICTIONARY_FIXTURE_PATH = fileURLToPath(
  new URL('../datasets/dictionary.json', import.meta.url),
);

/**
 * Read at call time rather than imported, so a missing fixture file fails with
 * a sentence telling you which command to run instead of a module resolution
 * error pointing at a line you did not write.
 */
export function loadDictionary(): Record<string, DictionaryEntry> {
  try {
    return JSON.parse(readFileSync(DICTIONARY_FIXTURE_PATH, 'utf8')) as Record<
      string,
      DictionaryEntry
    >;
  } catch {
    throw new Error(
      'No dictionary fixtures. Run: pnpm --filter @auto-learn/evals record-dictionary',
    );
  }
}
