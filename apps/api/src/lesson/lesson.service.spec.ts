// The model is mocked at the module boundary, as in the converse specs: `ai`
// and the provider packages are ESM-only and jest's CJS runtime cannot load
// them. `generateObject` drives the verdict; the rewrite (`propose`) and the
// word picker (`suggestCheckedWord`) are stubbed because they have their own
// specs and this one is about how the lesson joins them up.
jest.mock('ai', () => ({
  generateObject: jest.fn(),
  generateText: jest.fn(),
}));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

import { HttpException, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import type {
  ApiError,
  LessonFeedbackRequest,
  ModelLessonVerdict,
  ProposeResponse,
} from '@auto-learn/shared';
import type { ConverseService } from '../converse/converse.service';
import type { DictionaryService } from '../dictionary/dictionary.service';
import { LESSON_WORD_SYSTEM_PROMPT } from '../llm/prompts';
import type { ProposeService } from '../propose/propose.service';
import type { TelemetryService } from '../telemetry/telemetry.service';
import { LessonService } from './lesson.service';

const verdictOf = generateObject as jest.Mock;
const propose = jest.fn<Promise<ProposeResponse>, [unknown]>();
const suggestCheckedWord = jest.fn();
const pronunciation = jest.fn();
const spend = jest.fn();

const REVIEW: ProposeResponse = { sessionId: 's1', sentences: [] };

const verdict = (
  overrides: Partial<ModelLessonVerdict> = {},
): ModelLessonVerdict => ({
  pointFirst: true,
  pointFirstNote: 'You said what you built straight away.',
  parts: [{ label: 'point', quote: 'I build bots.' }],
  structureNote: 'Clear and short.',
  wordUse: 'unused',
  weakestSentence: 1,
  ...overrides,
});

const request = (
  overrides: Partial<LessonFeedbackRequest> = {},
): LessonFeedbackRequest => ({
  unit: 1,
  promptId: 'u1-01',
  answer: 'I build bots. They help shops. Like a store clerk.',
  word: null,
  ...overrides,
});

// The failure cases log on purpose; keep that out of the test output.
let logged: jest.SpyInstance;

beforeEach(() => {
  logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  verdictOf.mockReset();
  propose.mockReset();
  suggestCheckedWord.mockReset();
  pronunciation.mockReset();
  spend.mockReset();
  verdictOf.mockResolvedValue({ object: verdict(), usage: undefined });
  propose.mockResolvedValue(REVIEW);
});

afterEach(() => logged.mockRestore());

const service = () =>
  new LessonService(
    { propose } as unknown as ProposeService,
    { suggestCheckedWord } as unknown as ConverseService,
    { spend } as unknown as TelemetryService,
    { pronunciation } as unknown as DictionaryService,
  );

describe('LessonService.feedback', () => {
  it('returns the verdict with the first sentence quoted', async () => {
    const result = await service().feedback(request());

    expect(result.firstSentence).toBe('I build bots.');
    expect(result.pointFirst).toBe(true);
    expect(result.review).toBe(REVIEW);
    expect(propose).toHaveBeenCalledTimes(1);
    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'They help shops.', option: 'natural' }),
    );
  });

  // The second row is the one that needs sorting: the weakest sentence is
  // found first but comes after the word sentence in the answer.
  it.each([
    [1, 'They help shops. We mitigated the risk.'],
    [4, 'We mitigated the risk. It works.'],
  ])(
    'sends the weakest sentence and the word sentence, at most two, in answer order (weakest %i)',
    async (weakestSentence, text) => {
      verdictOf.mockResolvedValue({
        object: verdict({ weakestSentence, wordUse: 'correct' }),
        usage: undefined,
      });
      const answer =
        'I build bots. They help shops. They save time. We mitigated the risk. It works.';

      const result = await service().feedback(
        request({ answer, word: 'mitigate', known: ['allocate'] }),
      );

      expect(propose).toHaveBeenCalledTimes(1);
      expect(propose).toHaveBeenCalledWith({
        text,
        option: 'natural',
        known: ['allocate'],
      });
      expect(result.reviewedText).toBe(text);
    },
  );

  it('sends one sentence when the weakest one is also the word sentence', async () => {
    verdictOf.mockResolvedValue({
      object: verdict({ weakestSentence: 1, wordUse: 'correct' }),
      usage: undefined,
    });

    const result = await service().feedback(
      request({
        answer: 'I build bots. They help shops. It works.',
        word: 'help',
      }),
    );

    expect(result.reviewedText).toBe('They help shops.');
  });

  it('still sends the word sentence when the weakest index is out of range', async () => {
    verdictOf.mockResolvedValue({
      object: verdict({ weakestSentence: 9, wordUse: 'correct' }),
      usage: undefined,
    });

    const result = await service().feedback(
      request({
        answer: 'I build bots. They help shops. It works.',
        word: 'build',
      }),
    );

    expect(result.reviewedText).toBe('I build bots.');
  });

  it('out-of-range weakest index skips the rewrite', async () => {
    verdictOf.mockResolvedValue({
      object: verdict({ weakestSentence: 9 }),
      usage: undefined,
    });

    const result = await service().feedback(request({ word: null }));

    expect(propose).not.toHaveBeenCalled();
    expect(result.review).toBeNull();
    expect(result.reviewedText).toBeNull();
    expect(result.pointFirst).toBe(true);
    expect(result.firstSentence).toBe('I build bots.');
  });

  it('treats a negative weakest index as out of range', async () => {
    verdictOf.mockResolvedValue({
      object: verdict({ weakestSentence: -1 }),
      usage: undefined,
    });

    const result = await service().feedback(request());

    expect(propose).not.toHaveBeenCalled();
    expect(result.reviewedText).toBeNull();
  });

  it('propose failure keeps the verdict', async () => {
    propose.mockRejectedValue(new Error('propose is down'));

    const result = await service().feedback(request());

    expect(result.review).toBeNull();
    expect(result.reviewedText).toBeNull();
    expect(result.pointFirst).toBe(true);
    expect(result.structureNote).toBe('Clear and short.');
  });

  it('model failure is a 502', async () => {
    verdictOf.mockRejectedValue(new Error('down'));

    const error = await service()
      .feedback(request())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(502);
    expect(((error as HttpException).getResponse() as ApiError).code).toBe(
      'upstream_failed',
    );
    expect(propose).not.toHaveBeenCalled();
  });

  it('wordUse is null without a word', async () => {
    verdictOf.mockResolvedValue({
      object: verdict({ wordUse: 'correct' }),
      usage: undefined,
    });

    const result = await service().feedback(request({ word: null }));

    expect(result.wordUse).toBeNull();
  });

  it('passes the model wordUse through when there is a word', async () => {
    verdictOf.mockResolvedValue({
      object: verdict({ wordUse: 'incorrect' }),
      usage: undefined,
    });

    const result = await service().feedback(request({ word: 'mitigate' }));

    expect(result.wordUse).toBe('incorrect');
  });

  it('refuses a prompt the unit does not have, before spending a model call', async () => {
    const error = await service()
      .feedback(request({ promptId: 'u1-99' }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(400);
    expect(((error as HttpException).getResponse() as ApiError).code).toBe(
      'invalid_prompt',
    );
    expect(verdictOf).not.toHaveBeenCalled();
  });

  it('refuses a prompt that belongs to another unit', async () => {
    await expect(
      service().feedback(request({ unit: 2, promptId: 'u1-01' })),
    ).rejects.toBeInstanceOf(HttpException);
    expect(verdictOf).not.toHaveBeenCalled();
  });

  it('shows the model the question, the shape and the numbered sentences', async () => {
    await service().feedback(request({ word: 'mitigate' }));

    const sent = (verdictOf.mock.calls[0] as [{ prompt: string }])[0].prompt;
    expect(sent).toContain('What is the best thing you have built so far');
    expect(sent).toContain('Point first');
    expect(sent).toContain('mitigate');
    expect(sent).toContain('1. They help shops.');
  });

  it('records what the call cost', async () => {
    const usage = { inputTokens: 10, outputTokens: 5 };
    verdictOf.mockResolvedValue({ object: verdict(), usage });

    await service().feedback(request());

    expect(spend).toHaveBeenCalledWith(expect.any(String), usage);
  });

  /**
   * The page words each quote as what was heard, so a quote the learner never
   * said would put words in their mouth.
   */
  it('drops a part quote that is not in the answer, and keeps one that is', async () => {
    verdictOf.mockResolvedValue({
      object: verdict({
        parts: [
          { label: 'point', quote: 'i build  bots.' },
          { label: 'reason', quote: 'because it is cheap' },
          { label: 'example', quote: null },
        ],
      }),
      usage: undefined,
    });

    const result = await service().feedback(request());

    expect(result.parts).toEqual([
      { label: 'point', quote: 'i build  bots.' },
      { label: 'reason', quote: null },
      { label: 'example', quote: null },
    ]);
  });

  /**
   * Models type curly apostrophes and drop or add full stops; a quote is the
   * learner's words whatever marks surround them. An invented quote is still
   * invented once the marks are gone.
   */
  it('matches a quote by its words, not its punctuation', async () => {
    verdictOf.mockResolvedValue({
      object: verdict({
        parts: [
          { label: 'point', quote: 'I’m building bots' },
          { label: 'reason', quote: 'They’re cheaper than staff.' },
        ],
      }),
      usage: undefined,
    });

    const result = await service().feedback(
      request({ answer: "I'm building bots. They help shops, like a clerk." }),
    );

    expect(result.parts).toEqual([
      { label: 'point', quote: 'I’m building bots' },
      { label: 'reason', quote: null },
    ]);
  });
});

describe('LessonService.suggestWord', () => {
  it('passes the unit prompt to suggestCheckedWord', async () => {
    suggestCheckedWord.mockResolvedValue({ word: null });

    await service().suggestWord({ unit: 2, known: ['allocate'] });

    expect(suggestCheckedWord).toHaveBeenCalledTimes(1);
    const [system, prompt, known] = suggestCheckedWord.mock.calls[0] as [
      string,
      string,
      string[],
    ];
    expect(system).toBe(LESSON_WORD_SYSTEM_PROMPT);
    expect(prompt).toContain('Point, reason, example');
    expect(prompt).toContain('allocate');
    expect(known).toEqual(['allocate']);
  });

  it('adds the dictionary pronunciation to the word the picker found', async () => {
    const heard = { ipa: '/ˈmɪtɪɡeɪt/', audioUrl: 'https://x/mitigate.mp3' };
    suggestCheckedWord.mockResolvedValue({
      word: { word: 'mitigate', definition: 'make less severe' },
    });
    pronunciation.mockResolvedValue(heard);

    await expect(
      service().suggestWord({ unit: 1, known: [] }),
    ).resolves.toEqual({
      word: {
        word: 'mitigate',
        definition: 'make less severe',
        pronunciation: heard,
      },
    });
    expect(pronunciation).toHaveBeenCalledWith('mitigate');
  });

  it('looks nothing up when there is no word', async () => {
    suggestCheckedWord.mockResolvedValue({ word: null });

    await expect(
      service().suggestWord({ unit: 1, known: [] }),
    ).resolves.toEqual({ word: null });
    expect(pronunciation).not.toHaveBeenCalled();
  });
});
