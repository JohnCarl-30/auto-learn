import { resetApiToken } from './api-token';
import {
  ApiFailure,
  converse,
  dictate,
  fetchCardStream,
  proposeStream,
  reportEvent,
  speak,
} from './api';

/**
 * The NDJSON reader.
 *
 * A chunk boundary falls wherever the network puts it, which is the part of
 * streaming that is easy to get subtly wrong: split a line in half and the
 * naive reader either drops it or parses a fragment. These tests put the
 * boundary in the worst place on purpose.
 */
const DONE = {
  kind: 'done',
  response: {
    sessionId: 'session-1',
    sentences: [
      {
        index: 0,
        original: 'The policy had a big efect.',
        text: 'The policy had a big effect.',
        silentFixes: [],
        gated: [],
      },
    ],
  },
};

/** A body that hands back exactly these chunks, however they are cut. */
function body(chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    getReader: () => ({
      read: async () =>
        index < chunks.length
          ? { value: encoder.encode(chunks[index++]), done: false }
          : { value: undefined, done: true },
    }),
  };
}

function respond(chunks: string[], init: { ok?: boolean; status?: number } = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    body: body(chunks),
    json: async () => ({ code: 'too_many_sentences', message: 'Too many.' }),
  }) as unknown as typeof fetch;
}

const line = (value: unknown) => `${JSON.stringify(value)}\n`;

beforeEach(() => resetApiToken());
afterEach(() => jest.restoreAllMocks());

describe('proposeStream', () => {
  it('reassembles an event split across two chunks', async () => {
    const gate = line({
      kind: 'gate',
      sentence: 0,
      type: 'word-choice',
      original: 'big',
      teaser: 'stronger word available',
    });

    // The cut lands mid-object, which is the case a line-per-chunk reader gets
    // wrong while looking correct against a friendly server.
    respond([gate.slice(0, 20), gate.slice(20), line(DONE)]);

    const previews: unknown[] = [];
    await proposeStream({ text: 'A sentence.', option: 'academic' }, (p) =>
      previews.push(p),
    );

    expect(previews).toEqual([
      {
        kind: 'gate',
        sentence: 0,
        type: 'word-choice',
        original: 'big',
        teaser: 'stronger word available',
      },
    ]);
  });

  it('resolves with the payload from the done event, not from the preview', async () => {
    respond([
      line({
        kind: 'fix',
        sentence: 0,
        type: 'typo',
        original: 'efect',
        replacement: 'effect',
      }),
      line(DONE),
    ]);

    const response = await proposeStream(
      { text: 'A sentence.', option: 'grammar' },
      () => {},
    );

    expect(response.sessionId).toBe('session-1');
  });

  it('reads a final line that arrived without a trailing newline', async () => {
    respond([JSON.stringify(DONE)]);

    const response = await proposeStream(
      { text: 'A sentence.', option: 'grammar' },
      () => {},
    );

    expect(response.sessionId).toBe('session-1');
  });

  it('raises the error the server sent mid-stream', async () => {
    respond([
      line({
        kind: 'error',
        error: { code: 'upstream_failed', message: 'Could not reach it.' },
      }),
    ]);

    await expect(
      proposeStream({ text: 'A sentence.', option: 'grammar' }, () => {}),
    ).rejects.toMatchObject({ detail: { code: 'upstream_failed' } });
  });

  /**
   * A truncated stream is the failure worth being strict about: half a
   * proposal rendered as a whole one is wrong in a way nobody would notice.
   */
  it('refuses a stream that ends before the payload', async () => {
    respond([
      line({
        kind: 'fix',
        sentence: 0,
        type: 'typo',
        original: 'efect',
        replacement: 'effect',
      }),
    ]);

    await expect(
      proposeStream({ text: 'A sentence.', option: 'grammar' }, () => {}),
    ).rejects.toBeInstanceOf(ApiFailure);
  });

  it('still reads an ordinary refusal from the status code', async () => {
    respond([], { ok: false, status: 400 });

    await expect(
      proposeStream({ text: 'Four. Sentences. Here. Now.', option: 'grammar' }, () => {}),
    ).rejects.toMatchObject({ detail: { code: 'too_many_sentences' } });
  });

  it('rejects a line that does not match the contract', async () => {
    respond([line({ kind: 'gate', sentence: 0 }), line(DONE)]);

    await expect(
      proposeStream({ text: 'A sentence.', option: 'grammar' }, () => {}),
    ).rejects.toBeInstanceOf(ApiFailure);
  });
});

const CARD_DONE = {
  kind: 'done',
  response: {
    kind: 'card',
    card: {
      word: 'substantial',
      lemma: 'substantial',
      partOfSpeech: 'adjective',
      definition: 'Large enough to matter.',
      senseId: 's0',
      synonyms: [
        { word: 'considerable', nuance: 'stresses amount' },
        { word: 'significant', nuance: 'stresses effect' },
      ],
      useCases: ['A substantial rise.', 'A substantial share.'],
      register: 'formal',
      whyHere: null,
      pronunciation: { ipa: null, audioUrl: null },
    },
    replacement: 'substantial',
    alternative: null,
  },
};

describe('fetchCardStream', () => {
  const request = {
    kind: 'lookup' as const,
    sessionId: 'session-1',
    sentenceIndex: 0,
    word: 'substantial',
  };

  it('builds the card up one event at a time', async () => {
    respond([
      line({
        kind: 'definition',
        word: 'substantial',
        partOfSpeech: 'adjective',
        definition: 'Large enough to matter.',
      }),
      line({ kind: 'synonym', word: 'considerable', nuance: 'stresses amount' }),
      line({ kind: 'example', text: 'A substantial rise.' }),
      line(CARD_DONE),
    ]);

    const seen: unknown[] = [];
    await fetchCardStream(request, (partial) => seen.push(partial));

    // Each callback carries everything so far, not just the newest piece —
    // the view renders one object rather than accumulating its own.
    expect(seen).toHaveLength(3);
    expect(seen[0]).toMatchObject({
      word: 'substantial',
      definition: 'Large enough to matter.',
      synonyms: [],
    });
    expect(seen[2]).toMatchObject({
      synonyms: [{ word: 'considerable' }],
      useCases: ['A substantial rise.'],
    });
  });

  it('resolves with the payload, not with what it showed on the way', async () => {
    respond([
      line({
        kind: 'definition',
        word: 'substantial',
        partOfSpeech: 'adjective',
        definition: 'A partial thought.',
      }),
      line(CARD_DONE),
    ]);

    const card = await fetchCardStream(request, () => {});
    expect(card.kind).toBe('card');
    if (card.kind === 'card') {
      expect(card.card.definition).toBe('Large enough to matter.');
      expect(card.replacement).toBe('substantial');
    }
  });

  it('refuses a stream that ends before the payload', async () => {
    respond([
      line({
        kind: 'definition',
        word: 'substantial',
        partOfSpeech: 'adjective',
        definition: 'Large enough to matter.',
      }),
    ]);

    await expect(fetchCardStream(request, () => {})).rejects.toBeInstanceOf(
      ApiFailure,
    );
  });

  it('still reads an ordinary refusal from the status code', async () => {
    respond([], { ok: false, status: 422 });

    await expect(fetchCardStream(request, () => {})).rejects.toMatchObject({
      detail: { code: 'too_many_sentences' },
    });
  });
});

/**
 * The bearer token.
 *
 * Every call that spends the key carries one, and a locked API answers 401
 * `sign_in_required` without it. `fetch` is told apart by URL here because the
 * token route and the API share one mock.
 */
describe('the API token', () => {
  const REPLY = { reply: 'Sounds good.', review: null, skipped: 'unavailable' };

  const json = (status: number, payload: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });

  const signInRequired = json(401, {
    code: 'sign_in_required',
    message: 'Sign in to use auto-learn here.',
  });

  /** Answers the token route from `tokens` in turn and /converse from `replies`. */
  function serve(tokens: string[], replies: unknown[]) {
    const fetchMock: jest.Mock = jest.fn(async (url: string) => {
      if (url.endsWith('/api/auth/api-token')) {
        return json(200, { token: tokens.shift(), expiresIn: 300 });
      }
      return replies.shift();
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  const converseCalls = (fetchMock: jest.Mock) =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/converse'));

  const request = {
    scenario: 'free-talk' as const,
    history: [],
    utterance: 'I go.',
  };

  it('sends the bearer token on converse', async () => {
    const fetchMock = serve(['t1'], [json(200, REPLY)]);

    await converse(request);

    const [[, init]] = converseCalls(fetchMock);
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer t1',
      'Content-Type': 'application/json',
    });
  });

  it('retries once with a fresh token after sign_in_required', async () => {
    const fetchMock = serve(['t1', 't2'], [signInRequired, json(200, REPLY)]);

    await expect(converse(request)).resolves.toMatchObject({ reply: 'Sounds good.' });

    const calls = converseCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(calls[0][1].headers.Authorization).toBe('Bearer t1');
    expect(calls[1][1].headers.Authorization).toBe('Bearer t2');
  });

  it('surfaces sign_in_required when the retry also fails', async () => {
    const fetchMock = serve(['t1', 't2'], [signInRequired, signInRequired]);

    await expect(converse(request)).rejects.toMatchObject({
      detail: { code: 'sign_in_required' },
    });
    expect(converseCalls(fetchMock)).toHaveLength(2);
  });

  it('goes without a header, and does not retry, when signed out', async () => {
    const fetchMock: jest.Mock = jest.fn(async (url: string) =>
      url.endsWith('/api/auth/api-token')
        ? json(401, { error: 'not_signed_in' })
        : signInRequired,
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(converse(request)).rejects.toMatchObject({
      detail: { code: 'sign_in_required' },
    });

    const calls = converseCalls(fetchMock);
    expect(calls[0][1].headers.Authorization).toBeUndefined();
    // A fresh token cannot exist for someone who is signed out; the second
    // attempt would only repeat the refusal.
    expect(calls).toHaveLength(1);
  });

  it('keeps the multipart boundary for the browser to write when dictating', async () => {
    const fetchMock = serve(['t1'], [json(200, { transcript: 'hello there' })]);

    await dictate(new Blob(['x']));

    const [[, init]] = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/dictate'),
    );
    expect(init.headers).toEqual({ Authorization: 'Bearer t1' });
  });

  it('sends it on a GET too', async () => {
    const fetchMock = serve(['t1'], [json(200, { word: 'hello', audio: 'AAAA', mediaType: 'audio/mpeg' })]);

    await speak('hello');

    const [[, init]] = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/speak/'),
    );
    expect(init.headers).toEqual({ Authorization: 'Bearer t1' });
  });

  it('does not send it with telemetry, which is not locked', () => {
    const fetchMock = serve(['t1'], []);

    reportEvent('suggestion_accepted');

    // Not even a token request: a counter is not worth a round trip.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/telemetry$/);
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});
