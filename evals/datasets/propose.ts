import type { ProposeCase } from '../src/cases';

/**
 * Propose cases.
 *
 * Written from the sentences this product actually receives: university
 * students writing academic English as a second language. Every case carries a
 * `why`, and the ones that expect *nothing* are as load-bearing as the ones
 * that expect a fix — over-correction is the failure mode that costs a
 * learner's trust, and it is invisible to a dataset made only of broken
 * sentences.
 */
export const proposeCases: ProposeCase[] = [
  {
    id: 'typo-stays-silent',
    text: 'Many students recieve feedback only at the end of the term.',
    option: 'grammar',
    expectSilent: ['recieve'],
    why: 'A misspelling is mechanical. Gating it spends a card on a slip nobody learns vocabulary from.',
  },
  {
    id: 'subject-verb-agreement',
    text: 'The results shows a clear increase in participation.',
    option: 'grammar',
    expectGated: [{ original: 'shows', type: 'grammar' }],
    why: 'Agreement is the most common error in this corpus and must reach the gate, not be fixed behind the reader’s back.',
  },
  {
    id: 'missing-article',
    text: 'Researchers collected data from students in United States.',
    option: 'grammar',
    expectGated: [{ original: 'United States', type: 'grammar' }],
    why: 'Article omission is the signature L1-transfer error for several of the languages this product serves.',
  },
  {
    id: 'tense-and-agreement-across-two-sentences',
    text: 'The experiment was conduct in 2021. The result show a small improvement.',
    option: 'grammar',
    expectGated: [
      { original: 'conduct', type: 'grammar' },
      { original: 'show', type: 'grammar' },
    ],
    why: 'Pins the per-sentence index mapping: an edit reported against the wrong index is dropped silently in production.',
  },
  {
    id: 'punctuation-spacing-stays-silent',
    text: 'In conclusion ,the intervention reduced dropout by twelve percent .',
    option: 'grammar',
    expectSilent: [','],
    why: 'Space-before-punctuation is an L1 artefact, not a lesson. It must be fixed without a card.',
  },
  {
    id: 'weak-word-under-academic',
    text: 'The policy had a big effect on rural employment.',
    option: 'academic',
    expectGated: [{ original: 'big', type: 'word-choice' }],
    why: 'The core word-choice case: "big" is correct English and wrong for an essay, which is exactly what a card is for.',
  },
  {
    id: 'informal-hedge-under-academic',
    text: 'This approach is kind of effective for beginner learners.',
    option: 'academic',
    expectGated: [
      { original: 'kind of', type: ['register', 'word-choice'] },
    ],
    why: 'Spoken hedging in written work. Defensibly either tier-2 type, so both are accepted.',
  },
  {
    id: 'stilted-under-natural',
    text: 'The author want to say that this problem is very much important for the society.',
    option: 'natural',
    expectGated: [
      { original: 'want', type: 'grammar' },
      { original: 'very much important', type: ['word-choice', 'register'] },
    ],
    why: 'A grammar error and a phrasing problem in one sentence: the transform must handle both without collapsing them into one span.',
  },
  {
    id: 'wordiness-under-clearer',
    text: 'The reason why the experiment failed was because of the fact that the samples were contaminated.',
    option: 'clearer',
    expectGated: [
      { original: 'because of the fact that', type: ['word-choice', 'register'] },
    ],
    why: 'The clearer transform has to untangle without deleting the claim — the case most likely to produce a whole-sentence rewrite.',
  },
  {
    id: 'citation-must-survive',
    text: 'Recent work (Smith, 2020) suggest that motivation declines after week six.',
    option: 'grammar',
    expectGated: [{ original: 'suggest', type: 'grammar' }],
    why: 'A mangled citation is worse than an unfixed verb. Guards content preservation around structure the model likes to tidy.',
  },
  {
    id: 'grammar-transform-stays-in-scope',
    text: 'The government introduce new rules in 2019, and lots of people was affected.',
    option: 'grammar',
    expectGated: [
      { original: 'introduce', type: 'grammar' },
      { original: 'was', type: 'grammar' },
    ],
    why: '"lots of people" is informal but grammatical. Under a grammar transform it must be left alone — the button is a promise about scope.',
  },
  {
    id: 'clean-sentence-under-grammar',
    text: 'This paper examines how remote work affects team cohesion.',
    option: 'grammar',
    clean: true,
    why: 'Nothing is wrong. An invented correction here teaches a false rule and costs the reader their trust in every real one.',
  },
  {
    id: 'clean-sentence-under-academic',
    text: 'This study evaluates the extent to which peer feedback improves argumentative writing.',
    option: 'academic',
    clean: true,
    why: 'Already academic. "Make it academic" is the transform most tempted to edit for the sake of showing work.',
  },
  {
    id: 'domain-term-left-alone',
    text: 'The model corrects for heteroskedasticity in the residuals.',
    option: 'grammar',
    clean: true,
    why: 'Technical vocabulary reads like a typo to a corrector. "Fixing" it rewrites the writer’s meaning.',
  },
];
