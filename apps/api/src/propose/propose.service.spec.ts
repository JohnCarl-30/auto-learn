// These tests exercise validation and span resolution only — they never reach
// the model. `ai` and the two provider packages are ESM-only and jest's CJS
// runtime cannot load them, so they are mocked at the module boundary.
jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

import { HttpException } from '@nestjs/common';
import { locateSpan, splitSentences } from '@auto-learn/shared';
import type { ApiError, ModelEdit } from '@auto-learn/shared';
import { SessionStore, type StoredSentence } from '../session/session.store';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ProposeService } from './propose.service';

describe('splitSentences', () => {
  it('counts ordinary sentences', () => {
    expect(splitSentences('One here. Two here. Three here.')).toHaveLength(3);
  });

  it('treats a fragment with no terminator as one sentence', () => {
    expect(splitSentences('no full stop here')).toHaveLength(1);
  });

  it('ignores surrounding whitespace', () => {
    expect(splitSentences('   \n  Only one.  \n ')).toEqual(['Only one.']);
  });

  it('returns nothing for blank input', () => {
    expect(splitSentences('   \n\t ')).toEqual([]);
  });
});

describe('locateSpan', () => {
  const sentence = 'The results were very big and the big idea failed.';

  it('finds a whole-word span', () => {
    expect(locateSpan(sentence, 'very big')).toEqual({ start: 17, end: 25 });
  });

  it('returns null when the text is absent', () => {
    expect(locateSpan(sentence, 'enormous')).toBeNull();
  });

  it('respects fromIndex so duplicates resolve to the later one', () => {
    const first = locateSpan(sentence, 'big');
    const second = locateSpan(sentence, 'big', first!.end);
    expect(second!.start).toBeGreaterThan(first!.start);
  });

  it('prefers a word boundary over a substring match', () => {
    // "big" appears inside nothing here, but the guard matters for words like
    // "art" inside "start" — a substring match would corrupt the sentence.
    expect(locateSpan('restart the big engine', 'art')).toBeNull();
  });
});

describe('ProposeService cap enforcement', () => {
  const service = new ProposeService(
    new SessionStore(),
    new TelemetryService(),
  );

  const codeOf = async (text: string): Promise<ApiError> => {
    try {
      await service.propose({ text, option: 'academic' });
      throw new Error('expected a rejection');
    } catch (error) {
      return (error as HttpException).getResponse() as ApiError;
    }
  };

  it('refuses blank input', async () => {
    expect((await codeOf('  ')).code).toBe('empty_input');
  });

  it('refuses more than three sentences and reports the count', async () => {
    const body = await codeOf('A one. B two. C three. D four.');
    expect(body.code).toBe('too_many_sentences');
    expect(body.sentenceCount).toBe(4);
  });

  it('never truncates — an over-cap paste yields no session', async () => {
    const body = await codeOf('A one. B two. C three. D four. E five.');
    expect(body.code).toBe('too_many_sentences');
    expect(body).not.toHaveProperty('sessionId');
  });
});

describe('ProposeService span resolution', () => {
  const service = new ProposeService(
    new SessionStore(),
    new TelemetryService(),
  );
  // resolveSentence is private; these tests reach it deliberately because it
  // is where span resolution lives.
  const resolve = (original: string, edits: ModelEdit[]): StoredSentence =>
    (
      service as unknown as {
        resolveSentence: (
          index: number,
          original: string,
          edits: ModelEdit[],
        ) => StoredSentence;
      }
    ).resolveSentence(0, original, edits);

  it('applies silent fixes into text and gates the rest', () => {
    const result = resolve('The reuslts were very big.', [
      {
        type: 'typo',
        original: 'reuslts',
        replacement: 'results',
        reason: 'spelling',
      },
      {
        type: 'word-choice',
        original: 'very big',
        replacement: 'substantial',
        reason: 'stronger academic word',
      },
    ]);

    expect(result.text).toBe('The results were very big.');
    expect(result.silentFixes).toHaveLength(1);
    expect(result.gated).toHaveLength(1);
  });

  it('drops an edit whose original is not in the sentence', () => {
    const result = resolve('The results were substantial.', [
      {
        type: 'word-choice',
        original: 'gigantic',
        replacement: 'large',
        reason: 'x',
      },
    ]);
    expect(result.gated).toHaveLength(0);
  });

  it('never leaks the replacement into the teaser', () => {
    const result = resolve('The results were very big.', [
      {
        type: 'word-choice',
        original: 'very big',
        replacement: 'substantial',
        reason: 'consider substantial instead',
      },
    ]);
    expect(result.gated[0].teaser).not.toContain('substantial');
    expect(result.gated[0].replacement).toBe('substantial');
  });
});
