// `ai`, `@ai-sdk/openai` and `@ai-sdk/elevenlabs` are ESM-only; jest's CJS
// runtime cannot load them.
jest.mock('ai', () => ({
  generateObject: jest.fn(),
  streamObject: jest.fn(),
  generateSpeech: jest.fn(),
  transcribe: jest.fn(),
}));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { generateSpeech, streamObject, transcribe } from 'ai';
import { MAX_RECORDING_BYTES, ProposeStreamEvent } from '@auto-learn/shared';
import type {
  ApiError,
  DictateResponse,
  SpeakResponse,
  TelemetrySnapshot,
} from '@auto-learn/shared';
import { AppModule } from './app.module';

const speak = generateSpeech as unknown as jest.Mock;
const listen = transcribe as unknown as jest.Mock;

/**
 * HTTP-level tests against the real application.
 *
 * The service specs cover logic in isolation; these cover the wiring around
 * it — routing, the Zod body pipe, error status codes, and the fact that the
 * telemetry module actually observes the other modules. That seam used to be
 * checked by a browser, which was far more machinery than the job needs.
 *
 * Nothing here reaches a provider — the SDK is mocked at the module
 * boundary — so no key is required.
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

    // Listening before the first request, not per request. supertest binds an
    // ephemeral port itself when handed a server that is not listening, and
    // this file fires enough requests back to back that one occasionally lands
    // on a socket from a bind that is still closing — coming back empty with a
    // 403 or a 404 and none of Nest's headers. Diagnosed in `rate-limit.spec`,
    // which had the same intermittent failure for the same reason.
    await app.listen(0);
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

  /**
   * A GET rather than a POST, which is the point: the response depends on
   * nothing but the word, so it can be cached by anything between here and the
   * reader.
   */
  describe('GET /speak/:word', () => {
    beforeEach(() => {
      process.env.ELEVENLABS_VOICE_ID = 'voice-one';
      speak.mockReset();
      speak.mockResolvedValue({
        audio: { base64: 'bGlzdGVu', mediaType: 'audio/mpeg' },
      });
    });

    it('returns the audio for a word', async () => {
      const response = await request(server())
        .get('/speak/ubiquitous')
        .expect(200);

      expect(response.body as SpeakResponse).toEqual({
        word: 'ubiquitous',
        audio: 'bGlzdGVu',
        mediaType: 'audio/mpeg',
      });
    });

    it('lets the browser keep it, which is why this is a GET', async () => {
      const response = await request(server())
        .get('/speak/meticulous')
        .expect(200);

      expect(response.headers['cache-control']).toContain('max-age=86400');
    });

    /**
     * An explicit max-age makes even a 502 cacheable, so declaring the header
     * on the route rather than setting it on the way out would let one bad
     * minute at the provider leave a word silent for a day in every browser
     * that happened to ask during it.
     */
    it('does not let the browser keep a failure', async () => {
      speak.mockRejectedValue(new Error('elevenlabs is down'));

      const response = await request(server())
        .get('/speak/obfuscate')
        .expect(502);

      expect(response.headers['cache-control']).toBeUndefined();
    });

    /**
     * The route is unauthenticated and spends the provider key, so anything
     * that lets a sentence through turns it into free text-to-speech for
     * whoever finds the URL. Refused before any call is made.
     */
    it('refuses to read out anything longer than a word', async () => {
      const response = await request(server())
        .get('/speak/read%20this%20whole%20thing')
        .expect(400);

      expect((response.body as ApiError).code).toBe('invalid_request');
      expect(speak).not.toHaveBeenCalled();
    });

    it('refuses a word long enough to be a payload', async () => {
      await request(server())
        .get(`/speak/${'a'.repeat(49)}`)
        .expect(400);
      expect(speak).not.toHaveBeenCalled();
    });
  });

  describe('POST /dictate', () => {
    beforeEach(() => {
      listen.mockReset();
      listen.mockResolvedValue({ text: 'The evidence was substantial.' });
    });

    const recording = (bytes: number, contentType = 'audio/webm') =>
      request(server()).post('/dictate').attach('audio', Buffer.alloc(bytes), {
        filename: 'recording.webm',
        contentType,
      });

    it('returns what it heard, and stops there', async () => {
      const response = await recording(2_048).expect(201);

      // No proposal, no suggestions — the reader gets to fix a misheard word
      // before any of it is spent on a model call.
      expect(response.body as DictateResponse).toEqual({
        transcript: 'The evidence was substantial.',
      });
    });

    it('counts that someone spoke rather than typed', async () => {
      const before = (await request(server()).get('/telemetry').expect(200))
        .body as TelemetrySnapshot;

      await recording(2_048).expect(201);

      const after = (await request(server()).get('/telemetry').expect(200))
        .body as TelemetrySnapshot;

      expect(after.dictations).toBe(before.dictations + 1);
    });

    /**
     * Counting only the successes would make a voice feature that is breaking
     * look identical to one nobody wants — on the very number that decides
     * whether it earns more. Same split as cards, for the same reason.
     */
    it('counts a recording that produced nothing as a failure, not a silence', async () => {
      listen.mockResolvedValue({ text: '' });

      const before = (await request(server()).get('/telemetry').expect(200))
        .body as TelemetrySnapshot;

      await recording(2_048).expect(422);

      const after = (await request(server()).get('/telemetry').expect(200))
        .body as TelemetrySnapshot;

      expect(after.dictationsFailed).toBe(before.dictationsFailed + 1);
      expect(after.dictations).toBe(before.dictations);
    });

    it('counts a provider that fell over the same way', async () => {
      listen.mockRejectedValue(new Error('provider down'));

      const before = (await request(server()).get('/telemetry').expect(200))
        .body as TelemetrySnapshot;

      await recording(2_048).expect(502);

      const after = (await request(server()).get('/telemetry').expect(200))
        .body as TelemetrySnapshot;

      expect(after.dictationsFailed).toBe(before.dictationsFailed + 1);
      expect(after.dictations).toBe(before.dictations);
    });

    /**
     * The reason the upload is multipart at all. body-parser refuses oversized
     * JSON from inside middleware, before Nest's router exists, so its 413
     * escapes every filter and reaches the browser in a shape ApiError cannot
     * parse — which the reader sees as "the server sent back something
     * unexpected" rather than "that was too long".
     */
    it('says a long recording is too long, in the shape the browser reads', async () => {
      const response = await recording(MAX_RECORDING_BYTES + 1_024).expect(413);

      const error = ApiErrorOf(response.body);
      expect(error.code).toBe('recording_too_long');
      expect(error.message).toContain('60 seconds');
      expect(listen).not.toHaveBeenCalled();
    });

    it('refuses something that is not audio', async () => {
      const response = await recording(1_024, 'application/pdf').expect(400);

      expect(ApiErrorOf(response.body).code).toBe('invalid_request');
      expect(listen).not.toHaveBeenCalled();
    });

    it('refuses a request carrying no recording at all', async () => {
      const response = await request(server())
        .post('/dictate')
        .field('audio', 'not-a-file')
        .expect(400);

      expect(ApiErrorOf(response.body).code).toBe('invalid_request');
    });

    it('says it heard nothing rather than returning an empty draft', async () => {
      listen.mockResolvedValue({ text: '   ' });

      const response = await recording(2_048).expect(422);

      expect(ApiErrorOf(response.body).code).toBe('no_speech_detected');
    });

    it('reports a provider failure as an upstream failure', async () => {
      listen.mockRejectedValue(new Error('scribe is down'));

      const response = await recording(2_048).expect(502);

      expect(ApiErrorOf(response.body).code).toBe('upstream_failed');
    });
  });
});

const ApiErrorOf = (body: unknown): ApiError => body as ApiError;
