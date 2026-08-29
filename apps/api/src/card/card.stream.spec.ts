jest.mock('ai', () => ({
  generateObject: jest.fn(),
  streamObject: jest.fn(),
}));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

import { streamObject } from 'ai';
import type { CardStreamEvent, DictionarySense } from '@auto-learn/shared';
import { DictionaryService } from '../dictionary/dictionary.service';
import { SessionStore, type StoredSentence } from '../session/session.store';
import { TelemetryService } from '../telemetry/telemetry.service';
import { CardService } from './card.service';

const asMock = streamObject as unknown as jest.Mock;

const SENSES: DictionarySense[] = [
  { senseId: 's0', partOfSpeech: 'adjective', definition: 'Fairly large.' },
  { senseId: 's1', partOfSpeech: 'noun', definition: 'A material thing.' },
];

const FULL = {
  senseId: 's0',
  partOfSpeech: 'adjective',
  definition: 'Large enough to matter.',
  synonyms: [
    { word: 'considerable', nuance: 'stresses amount' },
    { word: 'significant', nuance: 'stresses effect' },
  ],
  useCases: ['A substantial rise.', 'A substantial share.'],
  register: 'formal',
  whyHere: 'More precise than "big".',
  alternative: 'considerable',
};

const sentence = (): StoredSentence => ({
  index: 0,
  original: 'The effect was big.',
  text: 'The effect was big.',
  silentFixes: [],
  gated: [
    {
      id: 'gate-1',
      type: 'word-choice',
      original: 'big',
      start: 16,
      end: 19,
      teaser: 'stronger word available',
      replacement: 'substantial',
      reason: 'More precise.',
    },
  ],
});

function streaming(partials: unknown[], final: unknown = FULL) {
  asMock.mockReturnValue({
    partialObjectStream: (async function* () {
      for (const partial of partials) {
        // Its own tick, as a chunk off a socket would be.
        await Promise.resolve();
        yield partial;
      }
    })(),
    object: Promise.resolve(final),
    usage: Promise.resolve({ inputTokens: 900, outputTokens: 200 }),
  });
}

function build() {
  const sessions = new SessionStore();
  const telemetry = new TelemetryService();
  const lookup = jest.fn().mockResolvedValue({
    status: 'found',
    entry: { word: 'substantial', senses: SENSES, synonyms: [] },
  });
  const pronunciation = jest
    .fn()
    .mockResolvedValue({ ipa: '/səbˈstænʃəl/', audioUrl: null });
  const dictionary = { lookup, pronunciation } as unknown as DictionaryService;
  const service = new CardService(sessions, dictionary, telemetry);
  const session = sessions.create('academic', [sentence()]);

  const run = async (partials: unknown[]): Promise<CardStreamEvent[]> => {
    streaming(partials);
    const prepared = await service.prepare({
      kind: 'suggestion',
      sessionId: session.id,
      suggestionId: 'gate-1',
    });
    const events: CardStreamEvent[] = [];
    for await (const event of service.stream(prepared)) events.push(event);
    return events;
  };

  return { service, sessions, telemetry, session, run };
}

beforeEach(() => asMock.mockReset());

describe('the card, while the model is still writing', () => {
  it('sends the definition as soon as it is finished', async () => {
    const { run } = build();

    const events = await run([
      // `synonyms` having begun is what proves `definition` is closed.
      {
        senseId: 's0',
        partOfSpeech: 'adjective',
        definition: 'Large enough to matter.',
        synonyms: [],
      },
    ]);

    expect(events[0]).toEqual({
      kind: 'definition',
      word: 'substantial',
      partOfSpeech: 'adjective',
      definition: 'Large enough to matter.',
    });
  });

  /**
   * The senseId is the first field the model writes and the senses on offer
   * are already known, so a card grounded in a sense we never supplied is
   * caught before the reader has been shown a definition for it — rather than
   * after, when it would have to be taken back.
   */
  it('sends nothing at all when the sense was never on offer', async () => {
    const { run } = build();

    const events = await run([
      {
        senseId: 'invented',
        partOfSpeech: 'adjective',
        definition: 'Something plausible.',
        synonyms: [],
      },
    ]);

    expect(events.filter((e) => e.kind === 'definition')).toHaveLength(0);
  });

  it('waits for the next field before trusting the one before it', async () => {
    const { run } = build();

    const events = await run([
      // Definition still being written: nothing follows it yet.
      { senseId: 's0', partOfSpeech: 'adjective', definition: 'Large en' },
      {
        senseId: 's0',
        partOfSpeech: 'adjective',
        definition: 'Large enough to matter.',
        synonyms: [],
      },
    ]);

    const definitions = events.filter((e) => e.kind === 'definition');
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      definition: 'Large enough to matter.',
    });
  });

  it('sends each synonym once the one after it has started', async () => {
    const { run } = build();

    const events = await run([
      {
        senseId: 's0',
        partOfSpeech: 'adjective',
        definition: 'Large enough to matter.',
        synonyms: [
          { word: 'considerable', nuance: 'stresses amount' },
          { word: 'signif' },
        ],
      },
    ]);

    expect(events.filter((e) => e.kind === 'synonym')).toEqual([
      { kind: 'synonym', word: 'considerable', nuance: 'stresses amount' },
    ]);
  });

  it('releases the last synonym and example once the field after them starts', async () => {
    const { run } = build();

    const events = await run([
      {
        senseId: 's0',
        partOfSpeech: 'adjective',
        definition: 'Large enough to matter.',
        synonyms: FULL.synonyms,
        useCases: FULL.useCases,
        register: 'formal',
      },
    ]);

    expect(events.filter((e) => e.kind === 'synonym')).toHaveLength(2);
    expect(events.filter((e) => e.kind === 'example')).toHaveLength(2);
  });

  it('ends with the payload the non-streaming route would have returned', async () => {
    const { run } = build();
    const done = (await run([])).at(-1);

    expect(done).toMatchObject({
      kind: 'done',
      response: { kind: 'card', replacement: 'substantial' },
    });
  });

  it('answers a grammar note in one line, having generated nothing', async () => {
    const { service, sessions } = build();
    const withGrammar = sentence();
    withGrammar.gated[0].type = 'grammar';
    const session = sessions.create('grammar', [withGrammar]);

    const prepared = await service.prepare({
      kind: 'suggestion',
      sessionId: session.id,
      suggestionId: 'gate-1',
    });
    const events: CardStreamEvent[] = [];
    for await (const event of service.stream(prepared)) events.push(event);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'done' });
    expect(asMock).not.toHaveBeenCalled();
  });

  it('reports a failure in the body, because the status line is long gone', async () => {
    const { service, session } = build();
    asMock.mockImplementation(() => {
      throw new Error('model exploded');
    });

    const prepared = await service.prepare({
      kind: 'suggestion',
      sessionId: session.id,
      suggestionId: 'gate-1',
    });
    const events: CardStreamEvent[] = [];
    for await (const event of service.stream(prepared)) events.push(event);

    expect(events).toEqual([
      {
        kind: 'error',
        error: {
          code: 'upstream_failed',
          message: 'Could not build the card.',
        },
      },
    ]);
  });
});
