import { describe, expect, it } from 'vitest';
import type { ModelEdit } from '@auto-learn/shared';
import type { ProposeCase } from '../cases';
import { scorePropose, type ProposeSubject } from './propose';

/**
 * The scorers are the only part of this harness that is deterministic, and a
 * scorer that is wrong is worse than no eval: it reports a number that nobody
 * re-derives. These run under `pnpm test` with the rest of the repo — they
 * call no model and cost nothing.
 */
const edit = (partial: Partial<ModelEdit>): ModelEdit => ({
  type: 'word-choice',
  original: 'big',
  replacement: 'substantial',
  reason: 'more precise',
  ...partial,
});

function subject(
  testCase: Partial<ProposeCase> & { text: string },
  edits: ModelEdit[],
): ProposeSubject {
  return {
    testCase: { id: 'case', option: 'academic', why: 'test', ...testCase },
    sentences: [testCase.text],
    proposal: { sentences: [{ index: 0, edits }] },
  };
}

const scoreFor = (subj: ProposeSubject, name: string) =>
  scorePropose(subj).find((s) => s.scorer === name);

describe('verbatim-spans', () => {
  const text = 'The policy had a big effect on rural employment.';

  it('passes when every edit quotes the sentence exactly', () => {
    const score = scoreFor(subject({ text }, [edit({ original: 'big' })]), 'verbatim-spans');
    expect(score?.passed).toBe(true);
  });

  it('fails a paraphrased span, which production would silently drop', () => {
    const score = scoreFor(
      subject({ text }, [edit({ original: 'a big effect on the countryside' })]),
      'verbatim-spans',
    );
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('unlocatable');
  });

  it('locates a gated span in the text left behind by silent fixes', () => {
    const score = scoreFor(
      subject({ text: 'The policy had a big efect on employment.' }, [
        edit({ type: 'typo', original: 'efect', replacement: 'effect' }),
        edit({ type: 'word-choice', original: 'big', replacement: 'substantial' }),
      ]),
      'verbatim-spans',
    );
    expect(score?.passed).toBe(true);
  });

  it('counts edits reported against a sentence that was never sent', () => {
    const subj = subject({ text: 'One sentence.' }, []);
    subj.proposal.sentences.push({ index: 4, edits: [edit({})] });
    const score = scoreFor(subj, 'verbatim-spans');
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('was not sent');
  });
});

describe('expected-fixes', () => {
  const text = 'Many students recieve feedback late.';

  it('accepts any of the types a case allows', () => {
    const score = scoreFor(
      subject(
        {
          text: 'This approach is kind of effective.',
          expectGated: [{ original: 'kind of', type: ['register', 'word-choice'] }],
        },
        [edit({ type: 'register', original: 'kind of', replacement: 'moderately' })],
      ),
      'expected-fixes',
    );
    expect(score?.passed).toBe(true);
  });

  it('fails when the fix arrives at the wrong tier', () => {
    const score = scoreFor(
      subject({ text, expectSilent: ['recieve'] }, [
        edit({ type: 'word-choice', original: 'recieve', replacement: 'receive' }),
      ]),
      'expected-fixes',
    );
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('word-choice');
  });

  it('matches a punctuation expectation that normalising would erase', () => {
    const score = scoreFor(
      subject({ text: 'In conclusion ,the rate fell.', expectSilent: [','] }, [
        edit({ type: 'punctuation', original: ' ,the', replacement: ', the' }),
      ]),
      'expected-fixes',
    );
    expect(score?.passed).toBe(true);
  });

  it('does not apply to a case that expects nothing in particular', () => {
    expect(scoreFor(subject({ text }, [edit({})]), 'expected-fixes')).toBeUndefined();
  });
});

describe('no-false-positives', () => {
  const text = 'This paper examines how remote work affects team cohesion.';

  it('passes when a clean sentence comes back untouched', () => {
    expect(scoreFor(subject({ text, clean: true }, []), 'no-false-positives')?.passed).toBe(true);
  });

  it('names the invented edit when one shows up', () => {
    const score = scoreFor(
      subject({ text, clean: true }, [edit({ original: 'examines', replacement: 'investigates' })]),
      'no-false-positives',
    );
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('examines');
  });

  it('says nothing about cases that were meant to need work', () => {
    expect(scoreFor(subject({ text }, []), 'no-false-positives')).toBeUndefined();
  });
});

describe('transform-discipline', () => {
  const text = 'The government introduce new rules, and lots of people was affected.';

  it('fails a restyle smuggled into a grammar-only transform', () => {
    const score = scoreFor(
      subject({ text, option: 'grammar' }, [
        edit({ type: 'grammar', original: 'introduce', replacement: 'introduced' }),
        edit({ type: 'register', original: 'lots of people', replacement: 'many people' }),
      ]),
      'transform-discipline',
    );
    expect(score?.passed).toBe(false);
    expect(score?.detail).toContain('lots of people');
  });

  it('has no opinion about the academic transform', () => {
    const score = scoreFor(
      subject({ text, option: 'academic' }, [edit({ type: 'register', original: 'lots of people' })]),
      'transform-discipline',
    );
    expect(score).toBeUndefined();
  });
});

describe('the remaining invariants', () => {
  it('mechanical-not-gated catches a gate that changes no letters', () => {
    const score = scoreFor(
      subject({ text: 'The result , however, was clear.' }, [
        edit({ type: 'register', original: ' , however,', replacement: ', however,' }),
      ]),
      'mechanical-not-gated',
    );
    expect(score?.passed).toBe(false);
  });

  it('span-minimality catches an edit that swallows its sentence', () => {
    const text = 'The reason why it failed was because of contamination.';
    const score = scoreFor(
      subject({ text, option: 'clearer' }, [
        edit({ original: 'The reason why it failed was because of', replacement: 'It failed because of' }),
      ]),
      'span-minimality',
    );
    expect(score?.passed).toBe(false);
  });

  it('no-deletion allows a punctuation edit to delete, but not a word-choice one', () => {
    const text = 'The study, was inconclusive.';
    expect(
      scoreFor(
        subject({ text }, [edit({ type: 'punctuation', original: ',', replacement: '' })]),
        'no-deletion',
      ),
    ).toBeUndefined();

    const score = scoreFor(
      subject({ text }, [edit({ type: 'word-choice', original: 'inconclusive', replacement: '' })]),
      'no-deletion',
    );
    expect(score?.passed).toBe(false);
  });
});
