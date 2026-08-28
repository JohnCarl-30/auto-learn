// `ai` and `@ai-sdk/openai` are ESM-only; jest's CJS runtime cannot load them.
jest.mock('ai', () => ({ generateObject: jest.fn(), streamObject: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));

import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { streamObject } from 'ai';
import { ProposeStreamEvent } from '@auto-learn/shared';
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
 *
 * Rate limiting is switched off for these: they fire enough requests from one
 * address to matter, and coupling this file's request count to the limits would
 * mean a new test here failing somewhere else for no readable reason. The limits
 * have their own spec.
 */
describe('HTTP surface', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(APP_GUARD)
      .useValue({ canActivate: () => true })
      .compile();

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

  describe('POST /propose/stream', () => {
    const withheld = 'substantial';

    beforeEach(() => {
      (streamObject as unknown as jest.Mock).mockReturnValue({
        partialObjectStream: (async function* () {
          // Its own tick, as a chunk off a socket would be.
          await Promise.resolve();
          yield {
            sentences: [
              {
                index: 0,
                edits: [
                  {
                    type: 'word-choice',
                    original: 'big',
                    replacement: withheld,
                    reason: 'More precise.',
                  },
                ],
              },
            ],
          };
        })(),
        object: Promise.resolve({
          sentences: [
            {
              index: 0,
              edits: [
                {
                  type: 'word-choice',
                  original: 'big',
                  replacement: withheld,
                  reason: 'More precise.',
                },
              ],
            },
          ],
        }),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      });
    });

    /**
     * The strongest test in this file, and the streaming counterpart of the
     * one in the Playwright suite. Everything else about the stream is a
     * convenience; this is the product's central claim, asserted against the
     * actual bytes rather than against a parsed object that could have been
     * built by the assertion itself.
     */
    it('never puts the withheld wording on the wire, in any line', async () => {
      const response = await request(server())
        .post('/propose/stream')
        .send({ text: 'The policy had a big effect.', option: 'academic' })
        .expect(200);

      expect(response.headers['content-type']).toContain(
        'application/x-ndjson',
      );
      expect(response.text).toContain('"kind":"gate"');
      expect(response.text).not.toContain(withheld);
    });

    it('closes with the same payload the non-streaming route returns', async () => {
      const response = await request(server())
        .post('/propose/stream')
        .send({ text: 'The policy had a big effect.', option: 'academic' });

      // Parsed with the shared schema rather than matched loosely: every line
      // has to be an event the client would accept, and the last one has to be
      // the payload.
      const events = response.text
        .trim()
        .split('\n')
        .map((line) => ProposeStreamEvent.parse(JSON.parse(line) as unknown));

      const last = events.at(-1);
      expect(last?.kind).toBe('done');
      if (last?.kind === 'done') {
        expect(last.response.sessionId).toBeTruthy();
        expect(last.response.sentences).toHaveLength(1);
      }
    });

    /**
     * Once a byte of an NDJSON body is out there is no status code left to
     * send, so validation has to run before the headers flush. A refusal that
     * arrives as a 200 with an error line inside is one a client can miss
     * entirely.
     */
    it('still refuses an over-cap paste with a status code, not a stream', async () => {
      const response = await request(server())
        .post('/propose/stream')
        .send({ text: 'One. Two. Three. Four.', option: 'grammar' })
        .expect(400);

      expect((response.body as ApiError).code).toBe('too_many_sentences');
      expect(response.headers['content-type']).not.toContain('ndjson');
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
