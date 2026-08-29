import { DictionaryService } from './dictionary.service';

/**
 * These read the real WordNet database, because it is on disk and takes under
 * a millisecond — mocking it would only test the mock. That is the point of
 * the change these tests came with: the dictionary is no longer a service that
 * can be having a bad day.
 */
describe('DictionaryService', () => {
  const service = () => new DictionaryService();

  const found = async (word: string) => {
    const result = await service().lookup(word);
    if (result.status !== 'found') {
      throw new Error(`expected "${word}" to be found, got ${result.status}`);
    }
    return result.entry;
  };

  it('reports a word WordNet does not carry as absent, not as an error', async () => {
    expect(await service().lookup('zzzqqx')).toEqual({ status: 'absent' });
  });

  it('numbers senses the way the card prompt refers to them', async () => {
    const entry = await found('substantial');

    expect(entry.senses.length).toBeGreaterThan(1);
    expect(entry.senses[0].senseId).toBe('s0');
    expect(entry.senses.map((sense) => sense.senseId)).toEqual(
      entry.senses.map((_, index) => `s${index}`),
    );
  });

  /**
   * The sense the old dictionary did not have at all. An eval case had to be
   * rewritten around its absence, so its arrival is worth pinning.
   */
  it('carries the sense of "address" that means dealing with a question', async () => {
    const entry = await found('address');
    const senses = entry.senses.map((sense) => sense.definition.toLowerCase());

    expect(senses.some((sense) => sense.includes('direct one'))).toBe(true);
  });

  it('carries the statistical sense of "significant"', async () => {
    const entry = await found('significant');
    const senses = entry.senses.map((sense) => sense.definition.toLowerCase());

    expect(senses.some((sense) => sense.includes('chance'))).toBe(true);
  });

  /**
   * WordNet's own notation. The satellite/head distinction is real
   * lexicography and means nothing to a learner, so both must arrive as
   * "adjective" or the card's part of speech will not match its own sense.
   */
  it('reports adjective satellites as adjectives', async () => {
    const entry = await found('robust');
    const parts = new Set(entry.senses.map((sense) => sense.partOfSpeech));

    expect(parts.has('adjective')).toBe(true);
    expect([...parts].every((part) => part !== 's')).toBe(true);
  });

  it('takes synonyms from the senses themselves, and never the word itself', async () => {
    const entry = await found('elucidate');

    expect(entry.synonyms.length).toBeGreaterThan(0);
    expect(entry.synonyms).not.toContain('elucidate');
    // WordNet separates words in a lemma with underscores.
    expect(entry.synonyms.every((word) => !word.includes('_'))).toBe(true);
  });

  it('caps the senses, so one word cannot swell the prompt', async () => {
    // "address" has eighteen. All of them would cost more and choose worse.
    expect((await found('address')).senses.length).toBeLessThanOrEqual(12);
  });

  it('answers a repeated word from cache', async () => {
    const shared = service();
    const first = await shared.lookup('mitigate');
    const second = await shared.lookup('mitigate');

    expect(second).toEqual(first);
  });
});
