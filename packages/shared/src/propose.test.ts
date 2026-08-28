import { describe, expect, it } from 'vitest';
import {
  GatedSuggestion,
  ProposeStreamEvent,
  StreamedGate,
  TEASERS,
} from './propose';

/**
 * The gate is a claim about what is *absent* from a payload, which is the one
 * kind of claim a type cannot make on its own — an extra field costs nothing
 * to add and nothing catches it. These tests are the thing that notices.
 */
describe('the gate, on the wire', () => {
  it('strips a replacement smuggled into a streamed gate', () => {
    const parsed = StreamedGate.parse({
      kind: 'gate',
      sentence: 0,
      type: 'word-choice',
      original: 'big',
      teaser: TEASERS['word-choice'],
      replacement: 'substantial',
      reason: 'more precise',
    });

    expect(parsed).not.toHaveProperty('replacement');
    expect(parsed).not.toHaveProperty('reason');
  });

  it('keeps the same two fields out of the final payload', () => {
    const parsed = GatedSuggestion.parse({
      id: 'a',
      type: 'register',
      original: 'kind of',
      start: 0,
      end: 7,
      teaser: TEASERS.register,
      replacement: 'somewhat',
      reason: 'too casual',
    });

    expect(parsed).not.toHaveProperty('replacement');
    expect(parsed).not.toHaveProperty('reason');
  });

  it('lets a streamed fix carry its replacement, which is not withheld', () => {
    const event = ProposeStreamEvent.parse({
      kind: 'fix',
      sentence: 0,
      type: 'typo',
      original: 'recieve',
      replacement: 'receive',
      note: 'Spelling — dropped, since a streamed string can arrive half-written.',
    });

    expect(event).toMatchObject({ kind: 'fix', replacement: 'receive' });
    expect(event).not.toHaveProperty('note');
  });

  it('has a teaser for every gated type, since the stream builds one per event', () => {
    for (const type of ['grammar', 'word-choice', 'register'] as const) {
      expect(TEASERS[type]).toBeTruthy();
      expect(TEASERS[type]).not.toContain('substantial');
    }
  });

  it('refuses an event whose kind is not one of the four', () => {
    expect(ProposeStreamEvent.safeParse({ kind: 'progress' }).success).toBe(false);
  });
});
