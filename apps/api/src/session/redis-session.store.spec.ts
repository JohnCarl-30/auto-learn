import { RedisSessionStore, type RedisLike } from './redis-session.store';
import { SESSION_TTL_MS, type StoredSentence } from './session.store';

/**
 * A Redis that is a map, implementing the two commands the store uses.
 *
 * The store depends on that narrow interface rather than on `ioredis`
 * precisely so this test can exercise the logic — serialisation, the key
 * namespace, what a miss means — without a server. What it cannot cover is
 * `ioredis` honouring `set(key, value, 'PX', ttl)`, which is the one thing
 * left to verify against a real instance.
 */
function fakeRedis() {
  const entries = new Map<string, { value: string; ttl: number }>();

  const redis: RedisLike = {
    get: (key) => Promise.resolve(entries.get(key)?.value ?? null),
    set: (key, value, _mode, ttl) => {
      entries.set(key, { value, ttl });
      return Promise.resolve('OK');
    },
  };

  return { redis, entries };
}

const sentence = (): StoredSentence => ({
  index: 0,
  original: 'The effect was big.',
  text: 'The effect was big.',
  silentFixes: [],
  gated: [
    {
      id: 'gate-1',
      type: 'word-choice',
      original: 'big',
      start: 16,
      end: 19,
      teaser: 'stronger word available',
      replacement: 'substantial',
      reason: 'More precise.',
    },
  ],
});

describe('RedisSessionStore', () => {
  it('reads back a session it wrote, wordings included', async () => {
    const { redis } = fakeRedis();
    const store = new RedisSessionStore(redis);

    const created = await store.create('academic', [sentence()]);
    const found = await store.get(created.id);

    expect(found).toEqual(created);
    // The withheld wording is the reason this store exists: /propose puts it
    // here and /card takes it out, and between them is a process boundary.
    expect(found?.sentences[0]?.gated[0]?.replacement).toBe('substantial');
  });

  it('lets Redis expire the session rather than sweeping it ourselves', async () => {
    const { redis, entries } = fakeRedis();
    await new RedisSessionStore(redis).create('academic', [sentence()]);

    expect([...entries.values()][0]?.ttl).toBe(SESSION_TTL_MS);
  });

  it('namespaces its keys, since a Redis is rarely one application’s alone', async () => {
    const { redis, entries } = fakeRedis();
    const created = await new RedisSessionStore(redis).create('academic', [
      sentence(),
    ]);

    expect([...entries.keys()]).toEqual([`auto-learn:session:${created.id}`]);
  });

  it('treats an unknown session as expired, which is what it is', async () => {
    const { redis } = fakeRedis();
    expect(await new RedisSessionStore(redis).get('nobody')).toBeUndefined();
  });

  /**
   * A session written by a version that shaped them differently, or truncated.
   * "That session has expired" is a case the client already handles and asks
   * the reader to resubmit; a 500 about JSON is not.
   */
  it('treats an unreadable session as expired rather than throwing', async () => {
    const { redis } = fakeRedis();
    await redis.set('auto-learn:session:broken', '{not json', 'PX', 1000);

    expect(await new RedisSessionStore(redis).get('broken')).toBeUndefined();
  });

  it('finds a suggestion and a sentence through the shared lookups', async () => {
    const { redis } = fakeRedis();
    const store = new RedisSessionStore(redis);
    const created = await store.create('academic', [sentence()]);

    const found = await store.findSuggestion(created.id, 'gate-1');
    expect(found?.suggestion.replacement).toBe('substantial');
    expect((await store.findSentence(created.id, 0))?.index).toBe(0);
    expect(await store.findSuggestion(created.id, 'missing')).toBeUndefined();
  });
});
