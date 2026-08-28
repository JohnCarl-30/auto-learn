// Same ESM boundary as every other *.spec.ts here: jest's CJS runtime cannot
// load `ai`, so the stream is driven by a mocked `streamObject`.
jest.mock('ai', () => ({ generateObject: jest.fn(), streamObject: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));

import { streamObject } from 'ai';
import type { ModelProposal, ProposeStreamEvent } from '@auto-learn/shared';
import { SessionStore } from '../session/session.store';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ProposeService } from './propose.service';

const asMock = streamObject as unknown as jest.Mock;

const SENTENCE = 'The policy had a big efect on rural employment.';

const finalProposal: ModelProposal = {
  sentences: [
    {
      index: 0,
      edits: [
        {
          type: 'typo',
          original: 'efect',
          replacement: 'effect',
          reason: 'Spelling.',
        },
        {
          type: 'word-choice',
          original: 'big',
          replacement: 'substantial',
          reason: 'More precise for academic writing.',
        },
      ],
    },
  ],
};

/** Stands in for what `streamObject` hands back: partials, then the whole thing. */
function streaming(partials: unknown[], final: ModelProposal = finalProposal) {
  asMock.mockReturnValue({
    partialObjectStream: (async function* () {
      for (const partial of partials) {
        // Its own tick, as a chunk off a socket would be.
        await Promise.resolve();
        yield partial;
      }
    })(),
    object: Promise.resolve(final),
    usage: Promise.resolve({
      inputTokens: 900,
      outputTokens: 120,
      inputTokenDetails: { cacheReadTokens: 800 },
    }),
  });
}

async function collect(
  stream: AsyncGenerator<ProposeStreamEvent>,
): Promise<ProposeStreamEvent[]> {
  const events: ProposeStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function build() {
  const telemetry = new TelemetryService();
  const service = new ProposeService(new SessionStore(), telemetry);

  const start = (abandoned?: AbortSignal) =>
    collect(
      service.stream(
        { text: SENTENCE, option: 'academic' },
        [SENTENCE],
        abandoned,
      ),
    );

  /** Feeds these partials through the mocked SDK and collects what comes out. */
  const run = (partials: unknown[], abandoned?: AbortSignal) => {
    streaming(partials);
    return start(abandoned);
  };

  return { service, telemetry, run, start };
}

const partial = (edits: unknown[]) => ({ sentences: [{ index: 0, edits }] });

beforeEach(() => asMock.mockReset());

describe('the gate, while the model is still writing', () => {
  it('sends a gate without the wording it is withholding', async () => {
    const { run } = build();
    const events = await run([
      partial([
        { type: 'word-choice', original: 'big', replacement: 'substanti' },
      ]),
    ]);
    const gate = events.find((e) => e.kind === 'gate');

    expect(gate).toMatchObject({ kind: 'gate', original: 'big' });
    expect(gate).not.toHaveProperty('replacement');
    expect(gate).not.toHaveProperty('reason');
    // The teaser is built from the type here, exactly as it is in the final
    // payload — never from anything the model wrote.
    expect((gate as { teaser: string }).teaser).toBe('stronger word available');
  });

  it('refuses to classify a type that is still half-written', async () => {
    // "word-cho" is not a type yet, and classification is what decides whether
    // a replacement may be sent. Guessing here is how a gated wording leaks.
    const { run } = build();
    const events = await run([
      partial([
        { type: 'word-cho', original: 'big', replacement: 'substantial' },
      ]),
    ]);

    expect(events.filter((e) => e.kind !== 'done')).toHaveLength(0);
  });

  it('waits for the next field before trusting the one before it', async () => {
    const { run } = build();

    const events = await run([
      // `original` may itself be a fragment. Nothing follows it yet, so
      // nothing is sent.
      partial([{ type: 'word-choice', original: 'bi' }]),
      // `replacement` existing at all is the proof that `original` is closed.
      partial([{ type: 'word-choice', original: 'big', replacement: '' }]),
    ]);

    const gates = events.filter((e) => e.kind === 'gate');
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({ original: 'big' });
  });

  it('sends a silent fix in full, since nothing about it is withheld', async () => {
    const { run } = build();

    const events = await run([
      partial([
        {
          type: 'typo',
          original: 'efect',
          replacement: 'effect',
          reason: 'Spelling.',
        },
      ]),
    ]);

    expect(events.find((e) => e.kind === 'fix')).toEqual({
      kind: 'fix',
      sentence: 0,
      type: 'typo',
      original: 'efect',
      replacement: 'effect',
    });
  });

  it('stops at the first edit it cannot send rather than sending the next one', async () => {
    const { run } = build();

    const events = await run([
      partial([
        // Incomplete: no `reason`, so `replacement` is not yet trustworthy.
        { type: 'typo', original: 'efect', replacement: 'effect' },
        { type: 'word-choice', original: 'big', replacement: 'substantial' },
      ]),
    ]);

    // Order is the contract. A reader watching fixes appear out of sequence
    // sees a different sentence from the one being fixed.
    expect(events.filter((e) => e.kind !== 'done')).toHaveLength(0);
  });

  it('never sends the same edit twice as the object grows', async () => {
    const { run } = build();

    const events = await run([
      partial([{ type: 'word-choice', original: 'big', replacement: 's' }]),
      partial([{ type: 'word-choice', original: 'big', replacement: 'subst' }]),
      partial([
        { type: 'word-choice', original: 'big', replacement: 'substantial' },
      ]),
    ]);

    expect(events.filter((e) => e.kind === 'gate')).toHaveLength(1);
  });
});

describe('what closes the stream', () => {
  it('ends with the payload the non-streaming route would have returned', async () => {
    const { run } = build();

    const done = (await run([])).at(-1);
    expect(done?.kind).toBe('done');

    const response = (
      done as { response: { sessionId: string; sentences: unknown[] } }
    ).response;
    expect(response.sessionId).toBeTruthy();

    const [sentence] = response.sentences as Array<{
      text: string;
      gated: Array<Record<string, unknown>>;
    }>;
    // The silent fix is applied; the gate is a teaser with no wording.
    expect(sentence.text).toContain('effect');
    expect(sentence.gated[0]).not.toHaveProperty('replacement');
  });

  it('records what the call cost, cached tokens kept separate', async () => {
    const { telemetry, run } = build();
    await run([]);

    const snapshot = telemetry.snapshot();
    expect(snapshot.inputTokens).toBe(900);
    expect(snapshot.cachedInputTokens).toBe(800);
    expect(snapshot.spendUsd).toBeGreaterThan(0);
  });

  it('reports a failure in the body, because the status line is long gone', async () => {
    const { start } = build();
    asMock.mockImplementation(() => {
      throw new Error('model exploded');
    });

    const events = await start();
    expect(events).toEqual([
      {
        kind: 'error',
        error: {
          code: 'upstream_failed',
          message: 'Could not reach the language model.',
        },
      },
    ]);
  });

  it('says nothing at all when the reader has already gone', async () => {
    const { start } = build();
    asMock.mockImplementation(() => {
      throw new Error('aborted');
    });

    const events = await start(AbortSignal.abort());
    expect(events).toEqual([]);
  });
});
