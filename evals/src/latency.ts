import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { SCENARIO_OPENERS } from '@auto-learn/shared';
import {
  CONVERSE_MAX_OUTPUT_TOKENS,
  CONVERSE_MODEL,
  converseProviderOptions,
} from '../../apps/api/src/llm/config';
import {
  CONVERSE_SYSTEM_PROMPT,
  converseUserPrompt,
} from '../../apps/api/src/llm/prompts';
import { loadApiEnv } from './env';

/**
 * How long the speaking partner takes to be heard.
 *
 * The other evals ask whether the model's output is any good; this one asks
 * how long the learner waits for it, which on /talk is the whole experience:
 * a partner who answers well in fourteen seconds is a partner nobody keeps
 * talking to. It times the running stack over HTTP, the way the browser does,
 * so a change anywhere between the model and the speaker shows up here.
 *
 * Four numbers per turn:
 *   reply      the model's answer alone, called the way the API calls it
 *   converse   POST /converse: the reply and the grammar review, together
 *   speak      POST /speak: the reply turned into audio
 *   first sound  converse + speak — when the learner first hears anything
 *
 * `converse - reply` is what the review costs the reply by being waited for;
 * `speak` is what the voice costs. Those two gaps are where the time goes.
 */

const USAGE = `pnpm --filter @auto-learn/evals latency [options]

  --api=URL       the running API (default http://localhost:3401)
  --trials=N      turns to time (default 5; /converse allows 10 a minute)
  --budget=MS     exit non-zero when the median time to first sound is over this

Needs the API, its model and (for speak) its voice engine running, as /talk does.`;

/** Short learner turns of the kind /talk sends, cycled across the trials. */
const UTTERANCES = [
  'I went to the market on Saturday and bought far too many mangoes.',
  'My week was busy because I have two deadlines and a group presentation.',
  'I am not sure if I should take the statistics course next semester.',
  'We finished the project late because nobody agreed on the design.',
  'I usually study in the library, but it is very noisy in the afternoon.',
];

const SCENARIO = 'free-talk' as const;
const HISTORY = [{ role: 'partner' as const, text: SCENARIO_OPENERS[SCENARIO] }];

type Trial = { utterance: string; reply: number; converse: number; speak: number; replyText: string };

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=', 2);
    flags.set(key!, value ?? 'true');
  }
  const number = (key: string) => {
    const raw = flags.get(key);
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw new Error(`--${key} needs a number`);
    return parsed;
  };
  return {
    help: flags.has('help'),
    api: flags.get('api') ?? 'http://localhost:3401',
    trials: number('trials') ?? 5,
    budget: number('budget'),
  };
}

/** The same routing as `apps/api/src/llm/models.ts`: Ollama when OLLAMA_MODEL is set, OpenAI otherwise. */
function replyModel() {
  const local = process.env.OLLAMA_MODEL;
  if (!local) return openai(CONVERSE_MODEL);
  return createOpenAI({
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    apiKey: 'ollama',
  }).chat(local);
}

async function timed<T>(work: () => Promise<T>): Promise<[number, T]> {
  const started = performance.now();
  const value = await work();
  return [Math.round(performance.now() - started), value];
}

async function post<T>(api: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

async function trial(api: string, utterance: string): Promise<Trial> {
  const [reply, direct] = await timed(() =>
    generateText({
      model: replyModel(),
      system: CONVERSE_SYSTEM_PROMPT,
      prompt: converseUserPrompt({ scenario: SCENARIO, history: HISTORY, utterance }),
      providerOptions: converseProviderOptions,
      maxOutputTokens: CONVERSE_MAX_OUTPUT_TOKENS,
    }),
  );
  // A fast empty answer is not a fast answer: the API would throw it away.
  if (!direct.text.trim()) throw new Error('the model returned an empty reply');
  const [converse, turn] = await timed(() =>
    post<{ reply: string }>(api, '/converse', { scenario: SCENARIO, history: HISTORY, utterance }),
  );
  const [speak] = await timed(() => post(api, '/speak', { text: turn.reply }));
  return { utterance, reply, converse, speak, replyText: turn.reply };
}

/** Nearest-rank percentile: p50 of five numbers is the third, never an average of two. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

function row(label: string, values: number[]): string {
  const cell = (n: number) => `${(n / 1000).toFixed(1)}s`.padStart(7);
  return `${label.padEnd(13)}${cell(percentile(values, 0.5))}${cell(percentile(values, 0.95))}${cell(Math.max(...values))}`;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  loadApiEnv();
  if (!process.env.OLLAMA_MODEL && !process.env.OPENAI_API_KEY) {
    process.stderr.write('Neither OLLAMA_MODEL nor OPENAI_API_KEY is set, so there is no model to time.\n');
    return 2;
  }

  const model = process.env.OLLAMA_MODEL ?? CONVERSE_MODEL;
  process.stderr.write(`timing ${options.trials} turns against ${options.api} (model: ${model})\n`);

  const trials: Trial[] = [];
  for (let i = 0; i < options.trials; i++) {
    const utterance = UTTERANCES[i % UTTERANCES.length]!;
    const result = await trial(options.api, utterance);
    trials.push(result);
    process.stderr.write(
      `  [${i + 1}/${options.trials}] reply ${result.reply}ms · converse ${result.converse}ms · speak ${result.speak}ms\n`,
    );
  }

  const firstSound = trials.map((t) => t.converse + t.speak);
  const lines = [
    '',
    `${'stage'.padEnd(13)}${'p50'.padStart(7)}${'p95'.padStart(7)}${'max'.padStart(7)}`,
    row('reply', trials.map((t) => t.reply)),
    row('converse', trials.map((t) => t.converse)),
    row('speak', trials.map((t) => t.speak)),
    row('first sound', firstSound),
    '',
    `waiting for the review costs the reply ${((percentile(trials.map((t) => t.converse), 0.5) - percentile(trials.map((t) => t.reply), 0.5)) / 1000).toFixed(1)}s at the median; the voice costs ${(percentile(trials.map((t) => t.speak), 0.5) / 1000).toFixed(1)}s`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);

  const dir = fileURLToPath(new URL('../results/runs/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const file = `${dir}latency-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), api: options.api, model, trials }, null, 2));
  process.stdout.write(`\nwritten to ${file}\n`);

  if (options.budget !== undefined) {
    const median = percentile(firstSound, 0.5);
    if (median > options.budget) {
      process.stdout.write(`\nOver budget: first sound p50 ${median}ms > ${options.budget}ms\n`);
      return 1;
    }
    process.stdout.write(`\nWithin budget: first sound p50 ${median}ms <= ${options.budget}ms\n`);
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exit(2);
  });
