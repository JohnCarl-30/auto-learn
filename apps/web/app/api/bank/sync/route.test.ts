/**
 * @jest-environment node
 *
 * A route handler, not a component: it takes a `Request` and returns a
 * `Response`, and jsdom provides neither. The rest of this app's tests are
 * jsdom because they render.
 */
jest.mock('@/lib/dal', () => ({ currentUser: jest.fn() }));
jest.mock('@/lib/bank-store', () => ({
  readBank: jest.fn(),
  writeBank: jest.fn(),
}));

import { currentUser } from '@/lib/dal';
import { readBank, writeBank } from '@/lib/bank-store';
import { POST } from './route';

const who = currentUser as jest.Mock;
const reads = readBank as jest.Mock;
const writes = writeBank as jest.Mock;

const USER = { id: 'u-1', email: 'writer@school.edu' };

const wireEntry = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/bank/sync', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

describe('POST /api/bank/sync', () => {
  beforeEach(() => {
    who.mockReset();
    reads.mockReset();
    writes.mockReset();
    who.mockResolvedValue(USER);
    reads.mockResolvedValue([]);
    writes.mockResolvedValue(undefined);
  });

  it('refuses a request from nobody, and reads no bank', async () => {
    who.mockResolvedValue(null);

    const response = await post({ entries: [] });

    expect(response.status).toBe(401);
    expect(reads).not.toHaveBeenCalled();
  });

  /**
   * The first sync from a browser that has words and an account that has none —
   * the whole of "claim your bank", which needs no separate endpoint because it
   * is the same merge with one side empty.
   */
  it('takes a bank the account has never seen', async () => {
    const response = await post({ entries: [wireEntry()] });

    expect(response.status).toBe(200);
    expect(writes).toHaveBeenCalledWith(USER.id, [wireEntry()]);
    await expect(response.json()).resolves.toMatchObject({
      entries: [wireEntry()],
    });
  });

  /** A new device: the client has nothing and should be handed everything. */
  it('hands back words the client did not have', async () => {
    reads.mockResolvedValue([wireEntry({ id: 'other:s1', lemma: 'other' })]);

    const body = await (await post({ entries: [] })).json();

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe('other:s1');
  });

  it('reconciles a word both sides changed rather than overwriting it', async () => {
    reads.mockResolvedValue([wireEntry({ timesReused: 7 })]);

    const body = await (
      await post({ entries: [wireEntry({ timesReused: 2 })] })
    ).json();

    // Each side only ever saw its own device's reuses, so the higher wins.
    expect(body.entries[0].timesReused).toBe(7);
  });

  /**
   * Nothing is deleted, ever. A word missing from the request is most likely a
   * word this device never had — not one somebody removed — and silence must not
   * destroy history.
   */
  it('does not drop a stored word just because the client omitted it', async () => {
    reads.mockResolvedValue([wireEntry({ id: 'kept:s1', lemma: 'kept' })]);

    const body = await (await post({ entries: [] })).json();

    expect(body.entries.map((e: { id: string }) => e.id)).toContain('kept:s1');
  });

  it('is idempotent, so a retry after a dropped connection is safe', async () => {
    const first = await (await post({ entries: [wireEntry()] })).json();
    reads.mockResolvedValue(first.entries);
    const second = await (await post({ entries: [wireEntry()] })).json();

    expect(second.entries).toEqual(first.entries);
  });

  it('never caches somebody’s own words', async () => {
    const response = await post({ entries: [] });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  describe('refuses', () => {
    it('a body that is not JSON', async () => {
      const response = await post('not json at all');

      expect(response.status).toBe(400);
      expect(writes).not.toHaveBeenCalled();
    });

    it('an entry that does not match the contract', async () => {
      const response = await post({ entries: [{ id: 'half-a-word' }] });

      expect(response.status).toBe(400);
      expect(writes).not.toHaveBeenCalled();
    });

    /** The size of this body is the client's choice, on an authenticated write. */
    it('a bank past the cap, and says what the cap is', async () => {
      const response = await post({
        entries: Array.from({ length: 1_601 }, (_, index) =>
          wireEntry({ id: `word-${index}:s1` }),
        ),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ limit: 1_600 });
    });
  });

  /**
   * A database that is unreachable or never migrated. The local bank is
   * untouched, so this is a retry rather than a loss — and the client is told to
   * treat it that way.
   */
  it('reports a database failure as retryable, not as a rejection', async () => {
    reads.mockRejectedValue(new Error('ECONNREFUSED'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await post({ entries: [] });

    expect(response.status).toBe(503);
    jest.restoreAllMocks();
  });
});
