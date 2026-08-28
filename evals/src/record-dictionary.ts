import { writeFileSync } from 'node:fs';
import { lookupWord } from '../../apps/api/src/dictionary/wordnet';
import { cardCases } from '../datasets/card';
import { DICTIONARY_FIXTURE_PATH } from './fixtures';
import type { DictionaryEntry } from './scorers/card';

/**
 * Records what the dictionary returns for every word in the card dataset.
 *
 * It calls the production lookup directly now, rather than re-implementing two
 * HTTP calls the way it had to when the source was someone else's API. Same
 * argument as the prompts: a recorder that mirrors the service records the
 * mirror, and drifts from it silently.
 *
 * Still recorded rather than read live, though the reason has narrowed. The
 * old worry was that Wiktionary edits would move the scores underneath us; the
 * new one is only a `wordnet-db` version bump, which the lockfile pins anyway.
 * What the file still buys is a wrong-sense failure that reproduces exactly,
 * and a diff when the sense inventory does change.
 */
async function main() {
  const words = [...new Set(cardCases.map((c) => c.word.toLowerCase()))].sort();
  const entries: Record<string, DictionaryEntry> = {};

  for (const word of words) {
    const entry = await lookupWord(word);

    if (!entry) {
      // Loud, and it does not write. A missing entry means the card suite
      // cannot run that case, and a half-written fixture file hides that.
      throw new Error(
        `WordNet has no entry for "${word}". In production this is the 422 a reader sees.`,
      );
    }

    entries[word] = entry;
    process.stderr.write(
      `  ${word}: ${entry.senses.length} senses, ${entry.synonyms.length} synonyms\n`,
    );
  }

  writeFileSync(DICTIONARY_FIXTURE_PATH, `${JSON.stringify(entries, null, 2)}\n`);
  process.stderr.write(`\nWrote ${words.length} entries to ${DICTIONARY_FIXTURE_PATH}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
