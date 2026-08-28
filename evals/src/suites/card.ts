import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { ModelCard } from '@auto-learn/shared';
import {
  CARD_MAX_OUTPUT_TOKENS,
  CARD_MODEL,
  cardProviderOptions,
} from '../../../apps/api/src/llm/config';
import {
  CARD_SYSTEM_PROMPT,
  cardUserPrompt,
} from '../../../apps/api/src/llm/prompts';
import { cardCases } from '../../datasets/card';
import type { CardCase } from '../cases';
import { priceCall, sumSpend } from '../cost';
import { loadDictionary } from '../fixtures';
import { judge } from '../judge';
import { cardScorers, scoreCard } from '../scorers/card';
import type { CardSubject } from '../scorers/card';
import type { Suite } from '../runner';
import { booleanScore, type Score } from '../types';

const CardVerdict = z.object({
  /** The definition is a true account of the sense it selected. */
  definitionIsCorrect: z.boolean(),
  /** And it is the sense the word actually carries in this sentence. */
  senseFitsTheSentence: z.boolean(),
  /** Every listed synonym really is a near-synonym in this sense. */
  synonymsAreReal: z.boolean(),
  /** Every nuance line states a true difference, not a restatement. */
  nuancesAreTrue: z.boolean(),
  /** Both examples are grammatical, academic, and use the word correctly. */
  examplesAreCorrect: z.boolean(),
  why: z.string(),
});

const RUBRIC = `You are grading a vocabulary card written for a university student using English as a second language. The learner cannot tell when the card is wrong, so a fluent error is the worst possible outcome and the one you are here to catch.

You are given the writer's sentence, the target word, the dictionary sense the card selected, and the card itself.

Mark definitionIsCorrect FALSE if the definition misstates the sense, or is so vague it would fit a dozen other words.
Mark senseFitsTheSentence FALSE if the word in that sentence carries a different sense from the one defined — this is the failure that matters most, and it is easy to miss because the card is internally consistent.
Mark synonymsAreReal FALSE if any listed word is not a near-synonym in this sense, or could not replace the target word in the writer's sentence.
Mark nuancesAreTrue FALSE if any nuance line states a difference that does not exist, or merely says the words are similar.
Mark examplesAreCorrect FALSE if either example is ungrammatical, is not academic writing, or uses the word in a different sense from the one defined.`;

async function judgeCard(subject: CardSubject) {
  const sense = subject.entry.senses.find(
    (s) => s.senseId === subject.card.senseId,
  );

  const { verdict, spend } = await judge({
    rubric: RUBRIC,
    schema: CardVerdict,
    prompt: [
      `Writer's sentence: ${subject.testCase.sentence}`,
      `Target word: ${subject.testCase.word}`,
      `Dictionary sense selected: ${sense ? `${sense.partOfSpeech} — ${sense.definition}` : `UNKNOWN (${subject.card.senseId} was not on offer)`}`,
      '',
      'The card:',
      `- part of speech: ${subject.card.partOfSpeech}`,
      `- definition: ${subject.card.definition}`,
      `- register: ${subject.card.register}`,
      ...subject.card.synonyms.map((s) => `- synonym ${s.word}: ${s.nuance}`),
      ...subject.card.useCases.map((u) => `- example: ${u}`),
      `- why here: ${subject.card.whyHere ?? '(none)'}`,
    ].join('\n'),
  });

  const scores: Score[] = [
    booleanScore(
      'judge-definition',
      verdict.definitionIsCorrect && verdict.senseFitsTheSentence,
      verdict.why,
    ),
    booleanScore(
      'judge-synonym-nuance',
      verdict.synonymsAreReal && verdict.nuancesAreTrue,
      verdict.why,
    ),
    booleanScore('judge-examples', verdict.examplesAreCorrect, verdict.why),
  ];

  return { scores, spend };
}

export const cardSuite: Suite<CardCase> = {
  name: 'card',
  model: CARD_MODEL,
  cases: cardCases,
  id: (testCase) => testCase.id,
  scorerNames: ({ judge: judging }) => [
    ...cardScorers.map((s) => s.name),
    ...(judging
      ? ['judge-definition', 'judge-synonym-nuance', 'judge-examples']
      : []),
  ],

  async run(testCase, options) {
    const dictionary = loadDictionary();
    const entry = dictionary[testCase.word.toLowerCase()];
    if (!entry) {
      throw new Error(
        `No recorded dictionary entry for "${testCase.word}". Run: pnpm --filter @auto-learn/evals record-dictionary`,
      );
    }

    const { object, usage } = await generateObject({
      model: openai(CARD_MODEL),
      schema: ModelCard,
      system: CARD_SYSTEM_PROMPT,
      prompt: cardUserPrompt({
        word: testCase.word,
        sentence: testCase.sentence,
        senses: entry.senses,
        synonyms: entry.synonyms,
        reason: testCase.reason,
      }),
      providerOptions: cardProviderOptions,
      maxOutputTokens: CARD_MAX_OUTPUT_TOKENS,
    });

    const subject: CardSubject = { testCase, entry, card: object };
    const scores = scoreCard(subject);
    const spends = [priceCall(CARD_MODEL, usage)];

    if (options.judge) {
      const judged = await judgeCard(subject);
      scores.push(...judged.scores);
      spends.push(judged.spend);
    }

    return { scores, spend: sumSpend(spends), output: object };
  },
};
