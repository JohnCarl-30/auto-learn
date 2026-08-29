import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { ModelProposal, splitSentences } from '@auto-learn/shared';
import {
  PROPOSE_MAX_OUTPUT_TOKENS,
  PROPOSE_MODEL,
  proposeProviderOptions,
} from '../../../apps/api/src/llm/config';
import {
  PROPOSE_SYSTEM_PROMPT,
  proposeUserPrompt,
} from '../../../apps/api/src/llm/prompts';
import { proposeCases } from '../../datasets/propose';
import type { ProposeCase } from '../cases';
import { priceCall, sumSpend } from '../cost';
import { judge } from '../judge';
import { placeEdits, proposeScorers, scorePropose } from '../scorers/propose';
import type { ProposeSubject } from '../scorers/propose';
import type { Suite } from '../runner';
import { booleanScore, ratioScore, type Score } from '../types';

/**
 * Both judged properties are per-edit or per-sentence booleans rather than a
 * 1-5 rating. Ratings drift — a model's "4" moves with the prompt around it —
 * and there is nothing to do with a 3.5 anyway. A boolean forces the judge to
 * commit, and the aggregate rate is the number worth watching.
 */
const ProposeVerdict = z.object({
  edits: z.array(
    z.object({
      original: z.string(),
      /** The replacement is correct English and genuinely better than the original. */
      isImprovement: z.boolean(),
      /** The tier and type are the right label for what changed. */
      correctlyClassified: z.boolean(),
      /** The one-line reason is true, and readable by a B2 learner. */
      reasonIsTrueAndPlain: z.boolean(),
      why: z.string(),
    }),
  ),
  /** Would applying every edit preserve every claim the writer made? */
  meaningPreserved: z.boolean(),
  meaningNote: z.string(),
});

const RUBRIC = `You are grading proposed edits to a sentence written by a university student using English as a second language.

For each edit you are given the exact text being replaced, the replacement, the label the model gave it, and the one-line reason shown to the learner.

The labels mean:
- "typo", "spacing", "punctuation" — mechanical slips, applied without telling the reader.
- "grammar" — an actual grammatical error.
- "word-choice" — correct but weak, vague, or imprecise for academic writing.
- "register" — too casual or too formal for an essay.

Mark isImprovement FALSE if the replacement is wrong English, changes what the writer claimed, or is merely a different way of saying the same thing.
Mark correctlyClassified FALSE if a mechanical slip was labelled as teachable, or a real grammatical error was labelled as word choice or register.
Mark reasonIsTrueAndPlain FALSE if the reason states something untrue about the language, or leans on grammar jargon a learner would not know.
Mark meaningPreserved FALSE if applying every edit would drop a claim, a hedge, a citation, or a number.`;

async function judgeProposal(subject: ProposeSubject) {
  const placed = placeEdits(subject);

  // No edits, nothing to judge, no call. Clean cases are the cheapest in the
  // suite and the deterministic scorers already own them.
  if (placed.length === 0) return { scores: [] as Score[], spend: null };

  const { verdict, spend } = await judge({
    rubric: RUBRIC,
    schema: ProposeVerdict,
    prompt: [
      `Sentence(s) as written: ${subject.sentences.join(' ')}`,
      `Transform the writer asked for: ${subject.testCase.option}`,
      '',
      'Proposed edits:',
      ...placed.map(
        ({ edit }) =>
          `- [${edit.type}] ${JSON.stringify(edit.original)} → ${JSON.stringify(edit.replacement)} · reason: ${edit.reason}`,
      ),
    ].join('\n'),
  });

  const good = verdict.edits.filter(
    (e) => e.isImprovement && e.correctlyClassified && e.reasonIsTrueAndPlain,
  );

  return {
    scores: [
      ratioScore('judge-edit-quality', good.length, verdict.edits.length, {
        threshold: 0.9,
        detail: verdict.edits
          .filter((e) => !good.includes(e))
          .map((e) => `${JSON.stringify(e.original)}: ${e.why}`)
          .join('; '),
      }),
      booleanScore(
        'judge-meaning-preserved',
        verdict.meaningPreserved,
        verdict.meaningNote,
      ),
    ],
    spend,
  };
}

export const proposeSuite: Suite<ProposeCase> = {
  name: 'propose',
  model: PROPOSE_MODEL,
  cases: proposeCases,
  id: (testCase) => testCase.id,
  scorerNames: ({ judge: judging }) => [
    ...proposeScorers.map((s) => s.name),
    ...(judging ? ['judge-edit-quality', 'judge-meaning-preserved'] : []),
  ],

  async run(testCase, options) {
    // Split here, exactly as the service does. If the splitter ever disagrees
    // with the model's numbering, `verbatim-spans` is what notices.
    const sentences = splitSentences(testCase.text);

    const { object, usage } = await generateObject({
      model: openai(PROPOSE_MODEL),
      schema: ModelProposal,
      system: PROPOSE_SYSTEM_PROMPT,
      prompt: proposeUserPrompt(sentences, testCase.option),
      providerOptions: proposeProviderOptions,
      maxOutputTokens: PROPOSE_MAX_OUTPUT_TOKENS,
    });

    const subject: ProposeSubject = { testCase, sentences, proposal: object };
    const scores = scorePropose(subject);
    const spends = [priceCall(PROPOSE_MODEL, usage)];

    if (options.judge) {
      const judged = await judgeProposal(subject);
      scores.push(...judged.scores);
      if (judged.spend) spends.push(judged.spend);
    }

    return { scores, spend: sumSpend(spends), output: object };
  },
};
