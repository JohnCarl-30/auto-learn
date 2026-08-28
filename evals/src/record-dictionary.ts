import { writeFileSync } from 'node:fs';
import { cardCases } from '../datasets/card';
import { DICTIONARY_FIXTURE_PATH } from './fixtures';
import type { DictionaryEntry } from './scorers/card';

/**
 * Records what the dictionary returns for every word in the card dataset.
 *
 * The card call is grounded in a third-party lookup, so an unrecorded harness
 * would drift whenever Wiktionary was edited — and a score that moves for that
 * reason is worse than no score, because it moves without anyone having
 * changed the product. Recorded once, committed, and re-recorded deliberately.
 *
 * The shape below mirrors `DictionaryService` exactly: same endpoints, same
 * `s0…sN` ids, same twelve-sense cut. If that service changes, this changes.
 */
const DICTIONARY_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const DATAMUSE_URL = 'https://api.datamuse.com/words';

/**
 * Far more patient than `DictionaryService`, which gives the same endpoints
 * 2.5 seconds because a user is waiting behind it. Nobody is waiting here, and
 * the big entries are genuinely slow — "address" has taken twenty seconds.
 */
const TIMEOUT_MS = 30_000;

/** One retry, because a recorder that half-fails leaves the dataset unrunnable. */
async function get(url: string): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  }
}

interface DictionaryApiEntry {
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string; example?: string }>;
  }>;
}

async function fetchSenses(word: string) {
  const response = await get(`${DICTIONARY_URL}/${encodeURIComponent(word)}`);
  if (!response.ok) return [];

  const payload = (await response.json()) as DictionaryApiEntry[];
  if (!Array.isArray(payload)) return [];

  const senses: DictionaryEntry['senses'] = [];
  for (const entry of payload) {
    for (const meaning of entry.meanings ?? []) {
      for (const definition of meaning.definitions ?? []) {
        if (!definition.definition) continue;
        senses.push({
          senseId: `s${senses.length}`,
          partOfSpeech: meaning.partOfSpeech ?? 'other',
          definition: definition.definition,
          ...(definition.example ? { example: definition.example } : {}),
        });
      }
    }
  }
  return senses.slice(0, 12);
}

async function fetchSynonyms(word: string) {
  const response = await get(`${DATAMUSE_URL}?rel_syn=${encodeURIComponent(word)}&max=12`);
  if (!response.ok) return [];

  const payload = (await response.json()) as Array<{ word?: string }>;
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => item.word).filter((v): v is string => Boolean(v));
}

async function main() {
  const words = [...new Set(cardCases.map((c) => c.word.toLowerCase()))].sort();
  const entries: Record<string, DictionaryEntry> = {};

  for (const word of words) {
    const [senses, synonyms] = await Promise.all([
      fetchSenses(word),
      fetchSynonyms(word),
    ]);

    if (senses.length === 0) {
      // Loud, and it does not write. A missing entry means the card suite
      // cannot run that case, and a half-written fixture file hides that.
      throw new Error(
        `No dictionary senses for "${word}". In production this is a 422 the user sees; either the word is wrong or the API is down.`,
      );
    }

    entries[word] = { word, senses, synonyms };
    process.stderr.write(
      `  ${word}: ${senses.length} senses, ${synonyms.length} synonyms\n`,
    );
  }

  writeFileSync(DICTIONARY_FIXTURE_PATH, `${JSON.stringify(entries, null, 2)}\n`);
  process.stderr.write(`\nWrote ${words.length} entries to ${DICTIONARY_FIXTURE_PATH}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
