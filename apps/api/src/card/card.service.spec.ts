// `ai` and `@ai-sdk/openai` are ESM-only; jest's CJS runtime cannot load them.
jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));

import { HttpException } from '@nestjs/common';
import { generateObject } from 'ai';
import type { ApiError, ModelCard } from '@auto-learn/shared';
import type { DictionaryService } from '../dictionary/dictionary.service';
import { SessionStore, type StoredSentence } from '../session/session.store';
import { CardService } from './card.service';

const generate = generateObject as unknown as jest.Mock;

const SENSES = [
  {
    senseId: 's0',
    partOfSpeech: 'adjective',
    definition: 'Corporeal; material; firm.',
  },
  {
    senseId: 's1',
    partOfSpeech: 'adjective',
    definition: 'Large in amount, size or importance.',
  },
];

const MODEL_CARD: ModelCard = {
  senseId: 's1',
  partOfSpeech: 'adjective',
  definition: 'Large in amount or importance.',
  synonyms: [
    { word: 'significant', nuance: 'broader; often about meaning, not size' },
    { word: 'considerable', nuance: 'slightly more formal' },
  ],
  useCases: [
    'The study found a substantial increase in reported cases.',
    'There is substantial evidence for this claim.',
  ],
  register: 'formal',
  whyHere: 'Precise where "very big" is vague.',
  alternative: 'considerable',
};

const sentence = (): StoredSentence => ({
  index: 0,
  original: 'The results were very big.',
  text: 'The results were very big.',
  silentFixes: [],
  gated: [
    {
      id: 'gate-1',
      type: 'word-choice',
      original: 'very big',
      start: 17,
      end: 25,
      teaser: 'stronger word available',
      replacement: 'substantial',
      reason: 'more precise for academic writing',
    },
  ],
});

const build = (lookupResult: unknown = { word: 'substantial', senses: SENSES, synonyms: ['significant'] }) => {
  const sessions = new SessionStore();
  const dictionary = {
    lookup: jest.fn().mockResolvedValue(lookupResult),
  } as unknown as DictionaryService;
  const service = new CardService(sessions, dictionary);
  const session = sessions.create('academic', [sentence()]);
  return { service, sessions, dictionary, sessionId: session.id };
};

const errorOf = async (fn: () => Promise<unknown>): Promise<ApiError> => {
  try {
    await fn();
    throw new Error('expected a rejection');
  } catch (error) {
    return (error as HttpException).getResponse() as ApiError;
  }
};

beforeEach(() => {
  generate.mockReset();
  generate.mockResolvedValue({ object: MODEL_CARD });
});

describe('CardService target resolution', () => {
  it('builds the card for the replacement word, not the one being replaced', async () => {
    const { service, sessionId, dictionary } = build();

    const result = await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });

    expect(dictionary.lookup).toHaveBeenCalledWith('substantial');
    expect(result.card.word).toBe('substantial');
  });

  it('releases the withheld replacement only with the card', async () => {
    const { service, sessionId } = build();

    const result = await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });

    expect(result.replacement).toBe('substantial');
  });

  it('returns no replacement for a plain lookup', async () => {
    const { service, sessionId } = build();

    const result = await service.build({
      kind: 'lookup',
      sessionId,
      sentenceIndex: 0,
      word: 'results',
    });

    expect(result.replacement).toBeNull();
    expect(result.card.whyHere).toBeNull();
  });

  it('rejects a lookup for a word that is not in the sentence', async () => {
    const { service, sessionId } = build();

    const error = await errorOf(() =>
      service.build({
        kind: 'lookup',
        sessionId,
        sentenceIndex: 0,
        word: 'elephant',
      }),
    );
    expect(error.code).toBe('word_not_in_sentence');
  });

  it('rejects an unknown suggestion id', async () => {
    const { service, sessionId } = build();

    const error = await errorOf(() =>
      service.build({ kind: 'suggestion', sessionId, suggestionId: 'nope' }),
    );
    expect(error.code).toBe('suggestion_not_found');
  });

  it('rejects an expired session', async () => {
    const { service } = build();

    const error = await errorOf(() =>
      service.build({
        kind: 'lookup',
        sessionId: 'gone',
        sentenceIndex: 0,
        word: 'results',
      }),
    );
    expect(error.code).toBe('session_not_found');
  });
});

describe('CardService grounding', () => {
  it('refuses to guess when the dictionary has no entry', async () => {
    const { service, sessionId } = build(null);

    const error = await errorOf(() =>
      service.build({ kind: 'suggestion', sessionId, suggestionId: 'gate-1' }),
    );
    expect(error.code).toBe('no_dictionary_entry');
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects a card whose sense was never on offer', async () => {
    const { service, sessionId } = build();
    generate.mockResolvedValue({
      object: { ...MODEL_CARD, senseId: 'invented' },
    });

    const error = await errorOf(() =>
      service.build({ kind: 'suggestion', sessionId, suggestionId: 'gate-1' }),
    );
    expect(error.code).toBe('upstream_failed');
  });

  it('keeps the chosen senseId on the card for traceability', async () => {
    const { service, sessionId } = build();

    const result = await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });
    expect(result.card.senseId).toBe('s1');
  });
});

describe('CardService caching', () => {
  it('does not call the model twice for the same word and sentence', async () => {
    const { service, sessionId } = build();

    await service.build({ kind: 'suggestion', sessionId, suggestionId: 'gate-1' });
    await service.build({ kind: 'suggestion', sessionId, suggestionId: 'gate-1' });

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('still releases the replacement on a cache hit', async () => {
    const { service, sessionId } = build();

    await service.build({ kind: 'suggestion', sessionId, suggestionId: 'gate-1' });
    const second = await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });

    expect(second.replacement).toBe('substantial');
  });
});
