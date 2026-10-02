jest.mock('@/lib/bank', () => ({
  listBank: jest.fn(),
  applySynced: jest.fn(),
}));

import { applySynced, listBank } from '@/lib/bank';
import { syncBank } from './sync';

const reads = listBank as jest.Mock;
const writes = applySynced as jest.Mock;

const wireEntry = {
  id: 'substantial:s1',
  word: 'substantial',
  lemma: 'substantial',
  partOfSpeech: 'adjective',
  senseId: 's1',
  definition: 'Large in amount, size or importance.',
  synonyms: [],
  useCases: [],
  register: 'formal',
  addedVia: 'accepted',
  addedAt: '2026-01-01T00:00:00.000Z',
  timesReused: 0,
  lastReusedAt: null,
};

describe('syncBank', () => {
  beforeEach(() => {
    reads.mockReset();
    writes.mockReset();
    // What IndexedDB holds: the full local record, sentence included.
    reads.mockResolvedValue([{ ...wireEntry, sourceSentence: 'Local only.' }]);
    writes.mockResolvedValue(1);
    global.fetch = jest.fn();
  });

  const answers = (body: unknown, status = 200) =>
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: status < 400,
      status,
      json: async () => body,
    });

  it('sends what this browser has and applies what comes back', async () => {
    answers({ entries: [wireEntry], syncedAt: '2026-09-30T00:00:00.000Z' });

    await expect(syncBank()).resolves.toEqual({
      total: 1,
      syncedAt: '2026-09-30T00:00:00.000Z',
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/bank/sync');
    expect(JSON.parse(init.body)).toEqual({ entries: [wireEntry] });
    expect(writes).toHaveBeenCalledWith([wireEntry]);
  });

  /**
   * The sentence is the one field that must never cross. Asserted on the request
   * body rather than on a helper, because this is the boundary where a mistake
   * would actually send someone's draft writing to a server.
   */
  it('never sends a source sentence, even if one reaches it', async () => {
    reads.mockResolvedValue([
      { ...wireEntry, sourceSentence: 'The sentence they wrote.' },
    ]);
    answers({ entries: [wireEntry], syncedAt: '2026-09-30T00:00:00.000Z' });

    await syncBank();

    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as string;
    expect(body).not.toContain('The sentence they wrote.');
    expect(body).not.toContain('sourceSentence');
  });

  it('fails rather than pretending, when the server refuses', async () => {
    answers({ error: 'sync_failed' }, 503);

    await expect(syncBank()).rejects.toThrow('sync refused with 503');
    expect(writes).not.toHaveBeenCalled();
  });

  /**
   * The response is written into IndexedDB, where a malformed record outlives the
   * request that produced it — so it is parsed, and a bad one is refused before
   * anything is stored.
   */
  it('refuses a response that does not match the contract', async () => {
    answers({ entries: [{ id: 'broken' }], syncedAt: 'now' });

    await expect(syncBank()).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled();
  });
});
