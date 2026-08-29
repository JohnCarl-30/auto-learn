import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import type { z } from 'zod';
import { CARD_MODEL } from '../../apps/api/src/llm/config';
import { priceCall } from './cost';
import type { Spend } from './types';

/**
 * Judging defaults to the strong model, not the cheap one.
 *
 * The deterministic scorers already catch everything mechanical. What is left
 * for a judge is exactly the class of error a weak model shares with the model
 * under test: a definition that reads well and is wrong. Overridable because
 * judging with a member of the same family as the generator is a known bias,
 * and the cheapest way to test for it is to re-run under another judge and see
 * whether the verdicts move.
 */
export const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? CARD_MODEL;
const JUDGE_EFFORT = process.env.EVAL_JUDGE_EFFORT ?? 'medium';

/**
 * Prepended to every rubric.
 *
 * The instruction to default to `false` is load-bearing. A judge asked "is
 * this good?" agrees, and a harness whose judge agrees with everything reports
 * 100% forever and detects nothing.
 */
const JUDGE_PREAMBLE = `You are grading the output of another model. You are not helping it, improving it, or being encouraging.

Rules:
- Judge only what is in front of you. Do not assume good intent behind a doubtful answer.
- When you are unsure whether something is correct, mark it FALSE. An eval that passes uncertain output is worth nothing.
- Fluency is not correctness. The failure you exist to catch is a confident, well-written claim that is false.
- Keep every "why" to one short sentence.`;

export async function judge<Schema extends z.ZodType>(input: {
  rubric: string;
  prompt: string;
  schema: Schema;
}): Promise<{ verdict: z.infer<Schema>; spend: Spend }> {
  const result = await generateObject({
    model: openai(JUDGE_MODEL),
    schema: input.schema,
    system: `${JUDGE_PREAMBLE}\n\n${input.rubric}`,
    prompt: input.prompt,
    providerOptions: {
      openai: {
        reasoningEffort: JUDGE_EFFORT,
        // Same reason production caches: the rubric is constant per suite.
        promptCacheKey: 'auto-learn:judge:v1',
      },
    },
    maxOutputTokens: 1500,
  });

  // Re-parsed rather than cast. The SDK has already validated it, so this
  // costs nothing at runtime and buys a return type that is inferred from the
  // caller's schema instead of asserted over the SDK's.
  return {
    verdict: input.schema.parse(result.object),
    spend: priceCall(JUDGE_MODEL, result.usage),
  };
}
