import { describe, expect, it } from 'vitest';
import type { ModelCard } from '@auto-learn/shared';
import type { CardCase } from '../cases';
import { scoreCard, type CardSubject, type DictionaryEntry } from './card';

const entry: DictionaryEntry = {
  word: 'novel',
  senses: [
    {
      senseId: 's0',
      partOfSpeech: 'noun',
      definition: 'A long work of narrative fiction.',
    },
    {
      senseId: 's1',
      partOfSpeech: 'adjective',
      definition: 'New; of a kind not seen before.',
    },
  ],
  synonyms: ['original', 'innovative'],
};

const card = (partial: Partial<ModelCard> = {}): ModelCard => ({
  senseId: 's1',
  partOfSpeech: 'adjective',
  definition: 'Different from anything done before, in a way that matters.',
  synonyms: [
    { word: 'original', nuance: 'stresses being the first, not just unfamiliar' },
    { word: 'innovative', nuance: 'implies a practical improvement, not only difference' },
  ],
  useCases: [
    'The team developed a novel method for measuring engagement.',
    'Few papers propose a genuinely novel framework.',
  ],
  register: 'neutral',
  whyHere: 'It marks the approach as new rather than merely recent.',
  alternative: 'original',
  ...partial,
});

function subject(overrides: Partial<ModelCard> = {}, testCase: Partial<CardCase> = {}): CardSubject {
  return {
    testCase: {
      id: 'case',
      word: 'novel',
      sentence: 'The paper proposes a novel approach to sentence segmentation.',
      reason: null,
      why: 'test',
      ...testCase,
    },
    entry,
    card: card(overrides),
  };
}

const scoreFor = (subj: CardSubject, name: string) =>
  scoreCard(subj).find((s) => s.scorer === name);

describe('sense-grounded', () => {
  it('fails a senseId the dictionary never offered', () => {
    const score = scoreFor(subject({ senseId: 's9' }), 'sense-grounded');
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('s9');
  });
});

describe('right-sense-for-context', () => {
  const forbid = { forbidInDefinition: ['book', 'fiction', 'story'] };

  it('passes a definition of the sense the sentence actually uses', () => {
    expect(scoreFor(subject({}, forbid), 'right-sense-for-context')?.passed).toBe(true);
  });

  it('catches the fluent, confident, wrong sense', () => {
    const score = scoreFor(
      subject({ senseId: 's0', definition: 'A long book that tells a made-up story.' }, forbid),
      'right-sense-for-context',
    );
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('book');
  });
});

describe('definition-rewritten', () => {
  it('fails when the dictionary string is handed straight through', () => {
    const score = scoreFor(
      subject({ definition: 'New; of a kind not seen before.' }),
      'definition-rewritten',
    );
    expect(score?.passed).toBe(false);
  });

  it('passes a real paraphrase', () => {
    expect(scoreFor(subject(), 'definition-rewritten')?.passed).toBe(true);
  });
});

describe('nuance-is-substantive', () => {
  it('rejects a nuance line that only says the words are alike', () => {
    const score = scoreFor(
      subject({
        synonyms: [
          { word: 'original', nuance: 'similar meaning' },
          { word: 'innovative', nuance: 'implies a practical improvement' },
        ],
      }),
      'nuance-is-substantive',
    );
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('original');
  });
});

describe('synonyms-are-distinct', () => {
  it('rejects the headword listed as its own synonym', () => {
    const score = scoreFor(
      subject({
        synonyms: [
          { word: 'novel', nuance: 'the same word, offered back to the reader' },
          { word: 'original', nuance: 'stresses being the first' },
        ],
      }),
      'synonyms-are-distinct',
    );
    expect(score?.passed).toBe(false);
  });
});

describe('examples-are-fresh', () => {
  it('rejects an example that hands the writer their own sentence back', () => {
    const score = scoreFor(
      subject({
        useCases: [
          'The paper proposes a novel approach to sentence segmentation.',
          'Few papers propose a genuinely novel framework.',
        ],
      }),
      'examples-are-fresh',
    );
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('echoes the writer');
  });

  it('rejects an example that never uses the word', () => {
    const score = scoreFor(
      subject({
        useCases: [
          'The team developed a fresh method for measuring engagement.',
          'Few papers propose a genuinely novel framework.',
        ],
      }),
      'examples-are-fresh',
    );
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('never uses');
  });

  it('accepts an inflected form of the word', () => {
    const score = scoreFor(
      subject({
        useCases: [
          'The approach is novelty-driven in the sense the authors intend.',
          'Few papers propose a genuinely novel framework.',
        ],
      }),
      'examples-are-fresh',
    );
    expect(score?.passed).toBe(true);
  });
});

describe('expectation scorers', () => {
  it('stay out of the way when the case declares nothing', () => {
    expect(scoreFor(subject(), 'register-label')).toBeUndefined();
    expect(scoreFor(subject(), 'part-of-speech')).toBeUndefined();
  });

  it('fail loudly when the case does declare one', () => {
    const score = scoreFor(subject({}, { expectRegister: 'formal' }), 'register-label');
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('expected formal');
  });

  it('checks the card against the sense it chose, not only the case', () => {
    const score = scoreFor(subject({ senseId: 's0', partOfSpeech: 'adjective' }), 'pos-matches-sense');
    expect(score?.passed).toBe(false);
  });
});
