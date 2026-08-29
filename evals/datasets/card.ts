import type { CardCase } from '../src/cases';

/**
 * Card cases, weighted towards polysemy.
 *
 * The card is the artifact the product exists to deliver, and its
 * characteristic failure is not incoherence — it is a fluent, correct-sounding
 * definition of the wrong sense. "novel" as a work of fiction, "address" as a
 * postal one. Nothing else in the system catches that: the schema validates,
 * the senseId is real, and the prose is clean.
 *
 * Every `word` here must exist in `dictionary.json`; run
 * `pnpm --filter @auto-learn/evals record-dictionary` after adding one.
 */
export const cardCases: CardCase[] = [
  {
    id: 'novel-is-not-a-book',
    word: 'novel',
    sentence: 'The paper proposes a novel approach to sentence segmentation.',
    reason: 'more precise than "new"',
    expectPartOfSpeech: 'adjective',
    forbidInDefinition: ['book', 'fiction', 'story', 'narrative'],
    why: 'The clearest polysemy trap in academic English, and the noun sense is by far the most frequent one in training data.',
  },
  {
    id: 'robust-is-not-healthy',
    word: 'robust',
    sentence: 'The correlation remained robust across all three samples.',
    reason: 'stronger than "clear"',
    expectPartOfSpeech: 'adjective',
    forbidInDefinition: ['healthy', 'vigorous', 'physically', 'muscular'],
    why: 'The bodily sense is the common one; the statistical sense is what the sentence means.',
  },
  {
    id: 'address-is-not-a-street',
    word: 'address',
    sentence: 'This section addresses the limitations of the current design.',
    reason: null,
    expectPartOfSpeech: 'verb',
    forbidInDefinition: [
      'street',
      'postal',
      'residence',
      'envelope',
      'speech',
      'audience',
    ],
    why:
      'Noun and verb senses are both common; picking the noun gives a card that is fluent and useless. ' +
      'This is the sentence the case was written for. It had to be swapped for one about speaking to a ' +
      'committee while the old dictionary was the source, which carried no "deal with a problem" sense ' +
      'at all — the case would have failed on a gap in the data rather than on anything the model did. ' +
      'WordNet has it, so the original is back, and the speaking senses join the wrong-sense tells.',
  },
  {
    id: 'leverage-is-not-a-lever',
    word: 'leverage',
    sentence: 'Researchers can leverage existing datasets to reduce collection costs.',
    reason: 'more precise than "use"',
    expectPartOfSpeech: 'verb',
    forbidInDefinition: ['lever', 'fulcrum', 'borrowed money', 'debt'],
    why: 'Three live senses — physics, finance, and the verb the sentence uses.',
  },
  {
    id: 'significant-in-a-statistics-sentence',
    word: 'significant',
    sentence: 'The difference between the two groups was statistically significant.',
    reason: null,
    expectPartOfSpeech: 'adjective',
    why: 'The everyday sense ("important") is a real sense and the wrong one here. Left to the judge, which can read the context.',
  },
  {
    id: 'substantial-as-a-plain-lookup',
    word: 'substantial',
    sentence: 'The intervention produced a substantial reduction in absenteeism.',
    reason: null,
    expectPartOfSpeech: 'adjective',
    why: 'Exercises the no-change-proposed branch of the prompt, and the dictionary entry whose archaic wording ("Corporeal; material; firm") the card must not parrot.',
  },
  {
    id: 'mitigate-is-formal',
    word: 'mitigate',
    sentence: 'Randomisation was used to mitigate selection bias.',
    reason: 'more precise than "reduce"',
    expectPartOfSpeech: 'verb',
    expectRegister: 'formal',
    why: 'Register drives whether a learner should reach for this word in an essay at all.',
  },
  {
    id: 'elucidate-is-formal',
    word: 'elucidate',
    sentence: 'Further work is needed to elucidate the underlying mechanism.',
    reason: 'more precise than "explain"',
    expectPartOfSpeech: 'verb',
    expectRegister: 'formal',
    why: 'A word a learner can easily overuse. The nuance lines against "explain" and "clarify" are the whole value of the card.',
  },
  {
    id: 'corroborate-against-near-synonyms',
    word: 'corroborate',
    sentence: 'These findings corroborate earlier reports from two independent laboratories.',
    reason: 'stronger than "agree with"',
    expectPartOfSpeech: 'verb',
    expectRegister: 'formal',
    why: 'Sits in a tight cluster — confirm, support, verify — so a lazy nuance line ("similar meaning") shows up here first.',
  },
  {
    id: 'salient-adjective',
    word: 'salient',
    sentence: 'The most salient limitation is the small sample size.',
    reason: 'more precise than "important"',
    expectPartOfSpeech: 'adjective',
    expectRegister: 'formal',
    why: 'Frequently misused by learners as a synonym for "important", which is exactly the distinction the nuance lines have to draw.',
  },
];
