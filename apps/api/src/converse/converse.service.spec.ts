// The model is mocked at the module boundary, as in the propose specs: `ai`
// and the provider packages are ESM-only and jest's CJS runtime cannot load
// them. `generateText` drives the reply, `generateObject` the review.
jest.mock('ai', () => ({
  generateObject: jest.fn(),
  generateText: jest.fn(),
  streamObject: jest.fn(),
}));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

import { HttpException } from '@nestjs/common';
import { generateObject, generateText } from 'ai';
import type {
  ApiError,
  ConverseRequest,
  ConverseTurn,
} from '@auto-learn/shared';
import { MemorySessionStore } from '../session/session.store';
import { ProposeService } from '../propose/propose.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ConverseService } from './converse.service';

const replyWith = generateText as jest.Mock;
const reviewWith = generateObject as jest.Mock;

/** The prompt a mocked model call was sent. */
const promptOf = (mock: jest.Mock, call = 0): string =>
  (mock.mock.calls[call] as [{ prompt: string }])[0].prompt;

const UTTERANCE = 'I want ask for more time because the essay is very big.';

const request = (
  overrides: Partial<ConverseRequest> = {},
): ConverseRequest => ({
  scenario: 'office-hours',
  history: [{ role: 'partner', text: 'Come in. What can I help you with?' }],
  utterance: UTTERANCE,
  ...overrides,
});

function setup() {
  const sessions = new MemorySessionStore();
  const telemetry = new TelemetryService();
  const service = new ConverseService(
    new ProposeService(sessions, telemetry),
    telemetry,
  );
  return { service, sessions, telemetry };
}

beforeEach(() => {
  replyWith.mockReset();
  reviewWith.mockReset();
  replyWith.mockResolvedValue({
    text: '  Of course. How much extra time do you think you need?  ',
    usage: undefined,
  });
  reviewWith.mockResolvedValue({
    object: {
      sentences: [
        {
          index: 0,
          edits: [
            {
              type: 'grammar',
              original: 'want ask',
              replacement: 'want to ask',
              reason: 'Add "to".',
            },
            {
              type: 'word-choice',
              original: 'very big',
              replacement: 'substantial',
              reason: 'Precise.',
            },
          ],
        },
      ],
    },
    usage: undefined,
  });
});

describe('ConverseService', () => {
  it('answers and reviews the turn in one response', async () => {
    const { service } = setup();
    const result = await service.converse(request());

    expect(result.reply).toBe(
      'Of course. How much extra time do you think you need?',
    );
    expect(result.skipped).toBeNull();
    expect(result.review?.sentences[0].gated.map((g) => g.original)).toEqual([
      'want ask',
      'very big',
    ]);
  });

  it('keeps the gate: no withheld wording reaches the client', async () => {
    const { service } = setup();
    const result = await service.converse(request());

    const wire = JSON.stringify(result.review);
    expect(wire).not.toContain('substantial');
    expect(wire).not.toContain('want to ask');
  });

  it('opens a real session, so /card can open the gate with no new route', async () => {
    const { service, sessions } = setup();
    const result = await service.converse(request());
    const gate = result.review!.sentences[0].gated[1];

    const found = await sessions.findSuggestion(
      result.review!.sessionId,
      gate.id,
    );
    expect(found?.suggestion.replacement).toBe('substantial');
  });

  it('reviews a spoken turn as natural speech, not as an essay', async () => {
    const { service } = setup();
    await service.converse(request());
    expect(promptOf(reviewWith)).toContain('fluent writer');
  });

  it('sends the scenario and the history to the partner, not to the review', async () => {
    const { service } = setup();
    await service.converse(request());

    const replyPrompt = promptOf(replyWith);
    expect(replyPrompt).toContain('office hours');
    expect(replyPrompt).toContain('You: Come in.');
    expect(promptOf(reviewWith)).not.toContain('Come in.');
  });

  it('still answers when the turn is too long to review, without counting an overflow', async () => {
    const { service, telemetry } = setup();
    const result = await service.converse(
      request({
        utterance: 'One thing. Two things. Three things. Four things.',
      }),
    );

    expect(result.reply).toBeTruthy();
    expect(result.review).toBeNull();
    expect(result.skipped).toBe('too_many_sentences');
    expect(reviewWith).not.toHaveBeenCalled();
    const counts = telemetry.snapshot();
    expect(counts.overflowAttempts).toBe(0);
    expect(counts.turnsUnreviewed).toBe(1);
  });

  it('still answers when the review fails', async () => {
    reviewWith.mockRejectedValue(new Error('provider down'));
    const { service, telemetry } = setup();
    const result = await service.converse(request());

    expect(result.reply).toBeTruthy();
    expect(result.review).toBeNull();
    expect(result.skipped).toBe('unavailable');
    expect(telemetry.snapshot().conversationTurns).toBe(1);
  });

  it('fails the turn when the partner does not answer', async () => {
    replyWith.mockRejectedValue(new Error('timeout'));
    const { service } = setup();

    const error = await service.converse(request()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(((error as HttpException).getResponse() as ApiError).code).toBe(
      'upstream_failed',
    );
    expect((error as HttpException).getStatus()).toBe(502);
  });

  it('treats an empty reply as no reply', async () => {
    replyWith.mockResolvedValue({ text: '   ', usage: undefined });
    const { service } = setup();
    await expect(service.converse(request())).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('sends only the most recent turns', async () => {
    const history: ConverseTurn[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'partner' : 'learner',
      text: `turn number ${i}`,
    }));
    const { service } = setup();
    // The schema caps history at twelve; the service trims again so a caller
    // that skips the pipe still cannot send the whole session.
    await service.converse(request({ history }));

    const replyPrompt = promptOf(replyWith);
    expect(replyPrompt).not.toContain('turn number 7:');
    expect(replyPrompt).not.toContain('turn number 7\n');
    expect(replyPrompt).toContain('turn number 19');
  });
});
