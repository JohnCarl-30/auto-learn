// `ai`, `@ai-sdk/openai` and `@ai-sdk/elevenlabs` are ESM-only; jest's CJS
// runtime cannot load them.
jest.mock('ai', () => ({
  generateObject: jest.fn(),
  generateSpeech: jest.fn(),
  transcribe: jest.fn(),
}));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApiError } from '@auto-learn/shared';
import { AppModule } from './app.module';
import { RATE_LIMITS } from './common/rate-limit';

/**
 * The limits exist to stop an unauthenticated caller spending the model budget,
 * so what is worth pinning is that a refusal actually arrives, that it arrives
 * in the shape the browser can read, and that it lands on the caller who earned
 * it rather than on the rest of the app.
 *
 * The bodies below are deliberately invalid: the guard runs before the Zod pipe,
 * so a 400 still spends the allowance and no model call is ever attempted.
 */
describe('rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Listening before the first request, not per request.
    //
    // supertest binds an ephemeral port itself when handed a server that is
    // not listening, and this file fires over a hundred requests back to back.
    // At that rate one occasionally lands on a socket from a bind that is
    // still closing, and comes back empty with a 403 or a 404 and none of
    // Nest's headers — an answer from nothing at all, which then reads as this
    // suite's assertion failing. Roughly one run in eight.
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  const propose = () => request(server()).post('/propose').send({});

  /**
   * Spends the whole allowance without asserting on any of it, so a test can
   * rely on the *next* call being refused.
   *
   * This exists because the test below used to inherit an exhausted limiter
   * from the test above it, which is worth removing on its own account: a test
   * that depends on its neighbour cannot be run alone, and reads as passing
   * when the neighbour is what is broken.
   *
   * It was not, however, the flake. That was the ephemeral bind above, found
   * by capturing the failing response instead of reasoning about it: the
   * status was a 403 one time and a 404 the next, with an empty body and none
   * of Nest's headers, which no guard in this application produces. The
   * discarded theory — that the minute-long window rolled mid-test — was
   * measurably wrong: the burst takes 33ms idle and 129ms under eight CPU
   * spinners, against 60,000ms.
   */
  const exhaustPropose = async () => {
    for (let i = 0; i < RATE_LIMITS.propose.limit; i++) await propose();
  };

  it('serves the whole allowance before refusing anything', async () => {
    for (let i = 0; i < RATE_LIMITS.propose.limit; i++) {
      await propose().expect(400);
    }

    await propose().expect(429);
  });

  it('refuses in the shape the browser parses every failure with', async () => {
    await exhaustPropose();

    const response = await propose().expect(429);

    const parsed = ApiError.safeParse(response.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.code).toBe('rate_limited');
  });

  /**
   * A platform health check polls from one address every few seconds. If it
   * shared the limit it would eventually take a 429, the host would read that
   * as "unhealthy", and it would restart a service that was working — dropping
   * every in-flight review and zeroing the telemetry on the way out.
   */
  it('never refuses the health check, whatever else is happening', async () => {
    // Far past any limit here, and from the same address as the burst above.
    for (let i = 0; i < RATE_LIMITS.default.limit + 20; i++) {
      await request(server()).get('/health').expect(200);
    }

    const response = await request(server()).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('limits each route separately, so a burst cannot silence the counts', async () => {
    // /propose has been refusing throughout. The accept and reject pings are
    // the numbers that decide what v2 is, and they must not be collateral
    // damage.
    await request(server())
      .post('/telemetry')
      .send({ event: 'suggestion_accepted' })
      .expect(204);

    await request(server()).get('/telemetry').expect(200);
  });

  /**
   * Dictation spends a provider call per recording, so it arrives limited like
   * every other route that costs money — and separately, so that exhausting it
   * cannot take pronunciation down with it. Someone who has recorded ten times
   * in a minute should still be able to hear the words they are being taught.
   */
  it('gives dictation its own allowance, and does not spend it on speaking', async () => {
    const dictate = () => request(server()).post('/dictate').send();

    for (let i = 0; i < RATE_LIMITS.dictate.limit; i++) {
      await dictate().expect(400);
    }

    const refused = await dictate().expect(429);
    expect(ApiError.safeParse(refused.body).data?.code).toBe('rate_limited');

    // /speak is untouched by the burst above. A 400 here is the word schema
    // refusing, which is the proof it reached the route at all.
    await request(server()).get('/speak/not%20one%20word').expect(400);
  });
});
