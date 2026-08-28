import { DictionaryService } from './dictionary.service';

/**
 * The dictionary is a third party on the critical path of the only artifact
 * this product delivers, and it is genuinely flaky: a cold entry has been
 * measured at twenty seconds, and the whole service was unreachable for the
 * length of an e2e run. What matters here is that its bad days stay
 * proportionate — a slow minute must not become a day of telling people their
 * words are not words.
 */
describe('DictionaryService', () => {
  const senses = [
    {
      meanings: [
        {
          partOfSpeech: 'adjective',
          definitions: [{ definition: 'Large in size or amount.' }],
        },
      ],
    },
  ];

  const ok = (payload: unknown) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  });

  const status = (code: number) => ({
    ok: false,
    status: code,
    json: () => Promise.resolve(null),
  });

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => jest.restoreAllMocks());

  /** Senses first, synonyms second — both are started together. */
  const answer = (...responses: unknown[]) => {
    for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  };

  it('reports a word the dictionary answered about but does not have', async () => {
    answer(status(404), ok([]));

    expect(await new DictionaryService().lookup('zzzz')).toEqual({
      status: 'absent',
    });
  });

  it('reports an unreachable dictionary as unreachable, not as an absent word', async () => {
    fetchMock.mockRejectedValue(new Error('timed out'));

    expect(await new DictionaryService().lookup('substantial')).toEqual({
      status: 'unavailable',
    });
  });

  it('treats a 5xx as unreachable too, since it says nothing about the word', async () => {
    fetchMock.mockResolvedValue(status(503));

    expect(await new DictionaryService().lookup('substantial')).toEqual({
      status: 'unavailable',
    });
  });

  it('retries once, because this endpoint is slow before it is down', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('timed out')) // senses, first attempt
      .mockResolvedValueOnce(ok([])) // synonyms
      .mockResolvedValueOnce(ok(senses)); // senses, retry

    const result = await new DictionaryService().lookup('big');
    expect(result.status).toBe('found');
  });

  /**
   * The bug worth the whole distinction. Caching a failure for a day means one
   * bad minute keeps answering for the next twenty-four hours.
   */
  it('never caches a failure, so an outage lasts as long as the outage', async () => {
    const service = new DictionaryService();

    fetchMock.mockRejectedValue(new Error('timed out'));
    expect((await service.lookup('substantial')).status).toBe('unavailable');

    fetchMock.mockReset();
    answer(ok(senses), ok([{ word: 'considerable' }]));
    expect((await service.lookup('substantial')).status).toBe('found');
  });

  it('still caches an answer, which is what the cache is for', async () => {
    const service = new DictionaryService();
    answer(ok(senses), ok([{ word: 'considerable' }]));

    await service.lookup('big');
    const calls = fetchMock.mock.calls.length;
    await service.lookup('big');

    expect(fetchMock.mock.calls).toHaveLength(calls);
  });

  it('survives a synonym service that is down on its own', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(senses))
      .mockRejectedValueOnce(new Error('datamuse is out'));

    const result = await new DictionaryService().lookup('big');
    expect(result).toMatchObject({ status: 'found', entry: { synonyms: [] } });
  });
});
