import {
  CARD_SYSTEM_PROMPT,
  PROPOSE_SYSTEM_PROMPT,
  cardUserPrompt,
  proposeSystemPrompt,
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
    {
      senseId: 's0',
      partOfSpeech: 'adjective',
      definition: 'Of real worth.',
      example: 'a substantial contribution',
    },
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

    expect(prompt).toContain(
      '- s0 (adjective): Of real worth. — used as: "a substantial contribution"',
    );
    // A sense without an example is listed without one, rather than with an
    // empty pair of quotes the model would have to interpret.
    expect(prompt).toContain('- s1 (noun): A material thing.');
    expect(prompt).not.toContain('A material thing. — used as');
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

/**
 * The bank reaching the proposal. Until it did, a word banked last week came
 * back offered as if it were new.
 */
describe('proposeUserPrompt with a bank', () => {
  /**
   * Measured, not assumed: with the rule present, "big" came back labelled
   * register instead of word-choice three or four times out of four, on
   * requests carrying no bank at all. A reader who has banked nothing pays
   * nothing for a feature they cannot use.
   */
  it('leaves the system prompt untouched when there is no bank', () => {
    expect(proposeSystemPrompt()).toBe(PROPOSE_SYSTEM_PROMPT);
    expect(proposeSystemPrompt([])).toBe(PROPOSE_SYSTEM_PROMPT);
    expect(proposeSystemPrompt(['substantial'])).not.toBe(
      PROPOSE_SYSTEM_PROMPT,
    );
  });

  it('sends nothing extra when the writer has banked nothing', () => {
    const prompt = proposeUserPrompt(['A sentence.'], 'academic');

    expect(prompt).not.toContain('Already learned');
    expect(prompt).toContain('0. A sentence.');
  });

  it('lists what they have learned, as a preference and not a ban', () => {
    const prompt = proposeUserPrompt(['A sentence.'], 'academic', [
      'substantial',
      'elucidate',
    ]);

    expect(prompt).toContain('Already learned: substantial, elucidate');
    // Only the list varies per request. The rule that acts on it lives in the
    // system prompt, which is a constant the provider can serve from cache —
    // and which is where the model actually reads its rules: the same
    // instruction in the user prompt was ignored four times out of four.
    // The rule that acts on the list is appended to the system prompt, and
    // only for requests that carry a bank.
    expect(proposeSystemPrompt(['substantial'])).toContain('already learned');
    expect(proposeSystemPrompt(['substantial'])).toContain(
      'sentence matters more than the lesson',
    );
  });
});
