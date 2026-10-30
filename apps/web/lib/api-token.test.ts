import { authHeaders, getApiToken, resetApiToken } from './api-token';

/**
 * The token cache.
 *
 * A token is good for five minutes and the page may make a call every few
 * seconds, so asking for one each time would double the traffic to the web
 * app; caching it past its expiry would hand the API a token it has to refuse.
 * These tests pin both edges.
 */
const tokenRoute = (token: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ token, expiresIn: 300 }),
});

const signedOut = {
  ok: false,
  status: 401,
  json: async () => ({ error: 'not_signed_in' }),
};

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  resetApiToken();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => jest.useRealTimers());

describe('getApiToken', () => {
  it('fetches once and reuses the token until a minute before it expires', async () => {
    fetchMock.mockResolvedValue(tokenRoute('t1'));

    expect(await getApiToken()).toBe('t1');

    jest.advanceTimersByTime(3 * 60 * 1000);
    expect(await getApiToken()).toBe('t1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/api-token');

    // 4 min 1 s in: under a minute of life left, so it is replaced.
    fetchMock.mockResolvedValue(tokenRoute('t2'));
    jest.advanceTimersByTime(61 * 1000);
    expect(await getApiToken()).toBe('t2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when signed out', async () => {
    fetchMock.mockResolvedValue(signedOut);

    expect(await getApiToken()).toBeNull();
    expect(await authHeaders()).toEqual({});
  });

  it('returns null when the route cannot be reached or answers nonsense', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    expect(await getApiToken()).toBeNull();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    });
    expect(await getApiToken()).toBeNull();
  });

  it('fetches a new token when asked for a fresh one', async () => {
    fetchMock.mockResolvedValueOnce(tokenRoute('t1'));
    expect(await getApiToken()).toBe('t1');

    fetchMock.mockResolvedValueOnce(tokenRoute('t2'));
    expect(await getApiToken({ fresh: true })).toBe('t2');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The fresh one is now what is cached.
    expect(await getApiToken()).toBe('t2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('authHeaders', () => {
  it('is a bearer header when there is a token', async () => {
    fetchMock.mockResolvedValue(tokenRoute('t1'));

    expect(await authHeaders()).toEqual({ Authorization: 'Bearer t1' });
  });
});
