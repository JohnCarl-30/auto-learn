// `ai`, `@ai-sdk/openai` and `@ai-sdk/elevenlabs` are ESM-only; jest's CJS
// runtime cannot load them.
jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

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

const PRONUNCIATION = {
  ipa: '/səbˈstænʃəl/',
  audioUrl: 'https://api.dictionaryapi.dev/media/substantial-us.mp3',
};

const build = (
  lookupResult: unknown = {
    status: 'found',
    entry: { word: 'substantial', senses: SENSES, synonyms: ['significant'] },
  },
  // Its own argument now, because it has its own source: senses come from
  // WordNet on disk and sound comes from Free Dictionary over the network.
  heard: unknown = PRONUNCIATION,
) => {
  const sessions = new SessionStore();
  // Held as their own references so assertions never pass an unbound method.
  const lookup = jest.fn().mockResolvedValue(lookupResult);
  const pronunciation = jest.fn().mockResolvedValue(heard);
  const dictionary = { lookup, pronunciation } as unknown as DictionaryService;
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

/** Usage rides along with every real generation, and the service prices it. */
const USAGE = {
  inputTokens: 1_200,
  outputTokens: 300,
  inputTokenDetails: { cacheReadTokens: 1_000 },
};

beforeEach(() => {
  generate.mockReset();
  generate.mockResolvedValue({ object: MODEL_CARD, usage: USAGE });
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
    const { service, sessionId } = build({ status: 'absent' });

    const error = await errorOf(() =>
      service.build({ kind: 'suggestion', sessionId, suggestionId: 'gate-1' }),
    );
    expect(error.code).toBe('no_dictionary_entry');
    expect(generate).not.toHaveBeenCalled();
  });

  /**
   * The two used to be one answer, and the reader was told a real word did not
   * exist whenever the dictionary was slow. Saying "I couldn't reach it" is the
   * difference between an outage and someone doubting their own vocabulary.
   */
  it('says the dictionary was unreachable rather than blaming the word', async () => {
    const { service, sessionId } = build({ status: 'unavailable' });

    const error = await errorOf(() =>
      service.build({ kind: 'suggestion', sessionId, suggestionId: 'gate-1' }),
    );
    expect(error.code).toBe('upstream_failed');
    expect(error.message).toContain("couldn't reach the dictionary");
    expect(error.message).not.toContain('substantial');
    expect(generate).not.toHaveBeenCalled();
  });

  it('prices the call at the card model\u2019s rate, cached input kept apart', async () => {
    const { service, sessionId, telemetry } = build();
    await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });

    const snapshot = telemetry.snapshot();
    expect(snapshot.inputTokens).toBe(1_200);
    expect(snapshot.cachedInputTokens).toBe(1_000);
    // 200 uncached at $2.50/M + 1,000 cached at $0.25/M + 300 out at $15/M,
    // which is $0.00525 — reported as $0.0053, because the snapshot rounds for
    // display while the counter behind it keeps full precision.
    //
    // Spelled out because the whole point of the split is that billing all
    // 1,200 input tokens at the uncached rate would read as $0.0075.
    expect((200 * 2.5 + 1_000 * 0.25 + 300 * 15) / 1_000_000).toBe(0.00525);
    expect(snapshot.spendUsd).toBe(0.0053);
  });

  /**
   * A gate can cover a phrase, and a dictionary cannot. Before this the card
   * behind such a gate was looked up as "significant effect", found nothing,
   * and returned a 422 — a marker the reader could click that nothing could
   * ever answer.
   */
  it('opens a phrase gate on the word it introduces, not the phrase', async () => {
    const { service, sessions, lookup } = build();
    const session = sessions.create('academic', [
      {
        index: 0,
        original: 'The policy had a big effect.',
        text: 'The policy had a big effect.',
        silentFixes: [],
        gated: [
          {
            id: 'gate-phrase',
            type: 'word-choice',
            original: 'big effect',
            start: 18,
            end: 28,
            teaser: 'stronger word available',
            replacement: 'significant effect',
            reason: 'More precise.',
          },
        ],
      },
    ]);

    const result = await service.build({
      kind: 'suggestion',
      sessionId: session.id,
      suggestionId: 'gate-phrase',
    });

    expect(lookup).toHaveBeenCalledWith('significant');
    // The whole span is still what gets applied to the sentence.
    expect(asCard(result).replacement).toBe('significant effect');
  });

  it('rejects a card whose sense was never on offer', async () => {
    const { service, sessionId } = build();
    generate.mockResolvedValue({
      object: { ...MODEL_CARD, senseId: 'invented' },
      usage: USAGE,
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

describe('CardService pronunciation', () => {
  /**
   * The stub here is cast through `unknown`, so a card that forgot to carry
   * pronunciation would typecheck and pass every other test in this file — and
   * then fail in the browser, where the response is re-parsed with the same
   * schema and an undefined field reads as "the server sent back something
   * unexpected". This is the test that notices.
   */
  it('carries what the dictionary heard through to the card', async () => {
    const { service, sessionId } = build();

    const result = await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });

    expect(asCard(result).card.pronunciation).toEqual(PRONUNCIATION);
  });

  it('still carries it on a second reader hitting the cache', async () => {
    const { service, sessionId, lookup } = build();
    const request = {
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    } as const;

    await service.build(request);
    const cached = await service.build(request);

    // Word-derived rather than request-derived, so unlike `replacement` it
    // needs no re-stitching — but only if it was cached in the first place.
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(asCard(cached).card.pronunciation).toEqual(PRONUNCIATION);
  });

  it('reports a word nobody recorded without pretending it is missing', async () => {
    const { service, sessionId } = build(undefined, {
      ipa: '/səbˈstænʃəl/',
      audioUrl: null,
    });

    const result = await service.build({
      kind: 'suggestion',
      sessionId,
      suggestionId: 'gate-1',
    });

    expect(asCard(result).card.pronunciation).toEqual({
      ipa: '/səbˈstænʃəl/',
      audioUrl: null,
    });
  });
});
