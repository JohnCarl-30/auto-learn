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
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  const propose = () => request(server()).post('/propose').send({});

  it('serves the whole allowance before refusing anything', async () => {
    for (let i = 0; i < RATE_LIMITS.propose.limit; i++) {
      await propose().expect(400);
    }

    await propose().expect(429);
  });

  it('refuses in the shape the browser parses every failure with', async () => {
    // Already over the limit from the previous test — the window has not moved.
    const response = await propose().expect(429);

    const parsed = ApiError.safeParse(response.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.code).toBe('rate_limited');
  });

  it('limits each route separately, so a burst cannot silence the counts', async () => {
    // /propose is exhausted at this point. The accept and reject pings are the
    // numbers that decide what v2 is, and they must not be collateral damage.
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
