// `ai` and `@ai-sdk/openai` are ESM-only; jest's CJS runtime cannot load them.
jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));

import { HttpException } from '@nestjs/common';
import { generateObject } from 'ai';
import type { ApiError, CardResponse, ModelCard } from '@auto-learn/shared';
import type { DictionaryService } from '../dictionary/dictionary.service';
import { SessionStore, type StoredSentence } from '../session/session.store';
import { TelemetryService } from '../telemetry/telemetry.service';
import { CardService } from './card.service';

const generate = generateObject as unknown as jest.Mock;

const asCard = (r: CardResponse) => {
  if (r.kind !== 'card') throw new Error(`expected a card, got "${r.kind}"`);
  return r;
};

const asNote = (r: CardResponse) => {
  if (r.kind !== 'note') throw new Error(`expected a note, got "${r.kind}"`);
  return r;
};

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
    {
      id: 'gate-grammar',
      type: 'grammar',
      original: 'were',
      start: 12,
      end: 16,
      teaser: 'grammar fix available',
      replacement: 'was',
      reason: '"results" is plural, so the verb must agree.',
    },
  ],
});

const build = (
  lookupResult: unknown = {
    word: 'substantial',
    senses: SENSES,
    synonyms: ['significant'],
  },
) => {
  const sessions = new SessionStore();
  // Held as its own reference so assertions never pass an unbound method.
  const lookup = jest.fn().mockResolvedValue(lookupResult);
  const dictionary = { lookup } as unknown as DictionaryService;
  const telemetry = new TelemetryService();
  const service = new CardService(sessions, dictionary, telemetry);
  const session = sessions.create('academic', [sentence()]);
  return {
    service,
    sessions,
    dictionary,
    lookup,
    telemetry,
    sessionId: session.id,
  };
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
    const { service, sessionId, lookup } = build();

    const result = await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });

    expect(lookup).toHaveBeenCalledWith('substantial');
    expect(asCard(result).card.word).toBe('substantial');
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
    expect(asCard(result).card.whyHere).toBeNull();
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
    expect(asCard(result).card.senseId).toBe('s1');
  });
});

describe('CardService caching', () => {
  it('does not call the model twice for the same word and sentence', async () => {
    const { service, sessionId } = build();

    await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });
    await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('still releases the replacement on a cache hit', async () => {
    const { service, sessionId } = build();

    await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });
    const second = await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });

    expect(second.replacement).toBe('substantial');
  });
});

describe('CardService grammar gates', () => {
  it('returns a note, not a vocabulary card', async () => {
    const { service, sessionId } = build();

    const result = await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-grammar',
    });

    expect(result.kind).toBe('note');
    expect(asNote(result).note.note).toContain('plural');
  });

  it('still releases the withheld correction, so the gate holds', async () => {
    const { service, sessionId } = build();

    const result = await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-grammar',
    });

    expect(result.replacement).toBe('was');
  });

  it('costs no dictionary lookup and no model call', async () => {
    const { service, sessionId, lookup } = build();

    await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-grammar',
    });

    expect(lookup).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('CardService engagement accounting', () => {
  it('counts a delivered card as both requested and delivered', async () => {
    const { service, sessionId, telemetry } = build();

    await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });

    const snapshot = telemetry.snapshot();
    expect(snapshot.cardsRequested).toBe(1);
    expect(snapshot.cardsDelivered).toBe(1);
    expect(snapshot.cardsFailed).toBe(0);
  });

  it('does not count a failed card as delivered', async () => {
    // The bug this replaced: a card that never rendered still counted as
    // engagement, inflating cardsRequested/proposals with failures.
    const { service, sessionId, telemetry } = build(null);

    await service
      .build({ kind: 'suggestion', sessionId, suggestionId: 'gate-1' })
      .catch(() => undefined);

    const snapshot = telemetry.snapshot();
    expect(snapshot.cardsRequested).toBe(1);
    expect(snapshot.cardsDelivered).toBe(0);
    expect(snapshot.cardsFailed).toBe(1);
  });

  it('does not count a failed model call as delivered', async () => {
    const { service, sessionId, telemetry } = build();
    generate.mockRejectedValue(new Error('model exploded'));

    await service
      .build({ kind: 'suggestion', sessionId, suggestionId: 'gate-1' })
      .catch(() => undefined);

    const snapshot = telemetry.snapshot();
    expect(snapshot.cardsDelivered).toBe(0);
    expect(snapshot.cardsFailed).toBe(1);
  });

  it('leaves card counters alone for a grammar note', async () => {
    const { service, sessionId, telemetry } = build();

    await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-grammar',
    });

    const snapshot = telemetry.snapshot();
    expect(snapshot.notesOpened).toBe(1);
    expect(snapshot.cardsRequested).toBe(0);
    expect(snapshot.cardsDelivered).toBe(0);
  });
});
