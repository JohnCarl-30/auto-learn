import {
  CARD_SYSTEM_PROMPT,
  PROPOSE_SYSTEM_PROMPT,
  cardUserPrompt,
  proposeUserPrompt,
} from './prompts';

/**
 * A `*.spec.ts`, so jest owns it: `prompts.ts` imports nothing ESM-only, which
 * is the whole point of keeping it separate from `models.ts`.
 *
 * These assertions are thin on purpose. Prompt *quality* is scored by `evals/`
 * against a real model; what belongs in a unit test is the mechanical contract
 * the harness and the services both rely on — that a builder still sends what
 * the prompt says it sends.
 */
describe('proposeUserPrompt', () => {
  it('numbers sentences from zero, matching the index the model returns', () => {
    const prompt = proposeUserPrompt(['First one.', 'Second one.'], 'academic');
    expect(prompt).toContain('0. First one.');
    expect(prompt).toContain('1. Second one.');
  });

  it('carries the transform instruction, not the button label', () => {
    expect(proposeUserPrompt(['A sentence.'], 'grammar')).toContain(
      'Correct grammatical errors only.',
    );
    expect(proposeUserPrompt(['A sentence.'], 'grammar')).not.toContain(
      'Fix my grammar',
    );
  });

  it('interpolates nothing into the system prompt, which is what makes it cacheable', () => {
    expect(PROPOSE_SYSTEM_PROMPT).not.toContain('${');
    expect(CARD_SYSTEM_PROMPT).not.toContain('${');
  });
});

describe('cardUserPrompt', () => {
  const senses = [
    { senseId: 's0', partOfSpeech: 'adjective', definition: 'Of real worth.' },
    { senseId: 's1', partOfSpeech: 'noun', definition: 'A material thing.' },
  ];

  it('lists every candidate sense by id, since the model must choose one', () => {
    const prompt = cardUserPrompt({
      word: 'substantial',
      sentence: 'The effect was substantial.',
      senses,
      synonyms: ['considerable'],
      reason: 'stronger than "big"',
    });

    expect(prompt).toContain('- s0 (adjective): Of real worth.');
    expect(prompt).toContain('- s1 (noun): A material thing.');
    expect(prompt).toContain('Candidate synonyms: considerable');
    expect(prompt).toContain('Why it was proposed: stronger than "big"');
  });

  it('says so explicitly when a lookup has no proposed change', () => {
    const prompt = cardUserPrompt({
      word: 'substantial',
      sentence: 'The effect was substantial.',
      senses,
      synonyms: [],
      reason: null,
    });

    expect(prompt).toContain('No change was proposed.');
    expect(prompt).toContain('No synonym candidates were found');
  });
});
