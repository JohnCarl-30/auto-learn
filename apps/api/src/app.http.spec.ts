// `ai` and `@ai-sdk/openai` are ESM-only; jest's CJS runtime cannot load them.
jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { ApiError, TelemetrySnapshot } from '@auto-learn/shared';
import { AppModule } from './app.module';

/**
 * HTTP-level tests against the real application.
 *
 * The service specs cover logic in isolation; these cover the wiring around
 * it — routing, the Zod body pipe, error status codes, and the fact that the
 * telemetry module actually observes the other modules. That seam used to be
 * checked by a browser, which was far more machinery than the job needs.
 *
 * Nothing here reaches the model, so no key is required.
 */
describe('HTTP surface', () => {
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

  describe('POST /propose', () => {
    it('refuses more than three sentences and reports the real count', async () => {
      const response = await request(server())
        .post('/propose')
        .send({
          text: 'One here. Two here. Three here. Four here. Five here.',
          option: 'academic',
        })
        .expect(400);

      const body = response.body as ApiError;
      expect(body.code).toBe('too_many_sentences');
      expect(body.sentenceCount).toBe(5);
      // The teaching message, not a bare failure.
      expect(body.message).toContain('one to three sentences');
    });

    it('never returns a session for an over-cap paste', async () => {
      const response = await request(server())
        .post('/propose')
        .send({ text: 'A. B. C. D.', option: 'grammar' })
        .expect(400);

      expect(response.body).not.toHaveProperty('sessionId');
    });

    it('refuses blank input', async () => {
      const response = await request(server())
        .post('/propose')
        .send({ text: '   ', option: 'grammar' })
        .expect(400);

      expect((response.body as ApiError).code).toBe('empty_input');
    });

    it('rejects an option that is not one of the four', async () => {
      const response = await request(server())
        .post('/propose')
        .send({ text: 'A sentence.', option: 'summarize' })
        .expect(400);

      expect((response.body as ApiError).code).toBe('invalid_request');
    });

    it('rejects a body missing required fields', async () => {
      const response = await request(server())
        .post('/propose')
        .send({})
        .expect(400);

      expect((response.body as ApiError).code).toBe('invalid_request');
    });
  });

  describe('POST /card', () => {
    it('rejects an unknown session', async () => {
      const response = await request(server())
        .post('/card')
        .send({
          kind: 'lookup',
          sessionId: 'does-not-exist',
          sentenceIndex: 0,
          word: 'results',
        })
        .expect(400);

      expect((response.body as ApiError).code).toBe('session_not_found');
    });

    it('rejects a body whose kind is not in the union', async () => {
      const response = await request(server())
        .post('/card')
        .send({ kind: 'banana' })
        .expect(400);

      expect((response.body as ApiError).code).toBe('invalid_request');
    });
  });

  describe('telemetry', () => {
    it('counts an over-cap paste without counting it as a proposal', async () => {
      const before = (await request(server()).get('/telemetry').expect(200))
        .body as TelemetrySnapshot;

      await request(server())
        .post('/propose')
        .send({ text: 'A. B. C. D. E.', option: 'academic' })
        .expect(400);

      const after = (await request(server()).get('/telemetry').expect(200))
        .body as TelemetrySnapshot;

      expect(after.overflowAttempts).toBe(before.overflowAttempts + 1);
      // The demand signal has to stay distinguishable from real usage.
      expect(after.proposals).toBe(before.proposals);
    });

    it('records an outcome reported by the browser', async () => {
      const before = (await request(server()).get('/telemetry').expect(200))
        .body as TelemetrySnapshot;

      await request(server())
        .post('/telemetry')
        .send({ event: 'suggestion_rejected' })
        .expect(204);

      const after = (await request(server()).get('/telemetry').expect(200))
        .body as TelemetrySnapshot;

      expect(after.rejected).toBe(before.rejected + 1);
      expect(after.accepted).toBe(before.accepted);
    });

    it('rejects an unknown event name', async () => {
      await request(server())
        .post('/telemetry')
        .send({ event: 'made_up' })
        .expect(400);
    });
  });
});
