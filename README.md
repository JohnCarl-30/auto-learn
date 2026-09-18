# auto-learn

Fix your sentence, and learn the word that fixed it.

Paste one to three sentences, choose what you want done to them, and get them
back corrected. Mechanical slips — a misspelling, a space before a comma — are
fixed silently and shown in the diff. Anything with something to teach is held
behind a gate: you see that a better word exists, not what it is. Opening the
gate gives you a card about that word, and the word goes to your bank.

It is built for university students writing academic English as a second
language.

## The gate

Worth understanding before reading any of the code, because most of the design
follows from it.

`/propose` asks a model for edits and stores them server-side. The response it
sends the browser has no `replacement` field on a teachable suggestion — not a
flag saying "do not show this", the field is simply absent. `/card` is what
releases it, and it releases it alongside the definition, the synonyms and the
nuance that justify it.

So you cannot apply a change you have not been taught. There is no permission
check to forge and no "was this opened?" bookkeeping to get wrong: the text
does not exist on the client until the teaching does.

## Running it

Node 20.3 or newer, and pnpm.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # add OPENAI_API_KEY
pnpm dev
```

The web app is on http://localhost:3000, the API on http://localhost:3001.

`OPENAI_API_KEY` is the only one you need. Without `ELEVENLABS_API_KEY` and
`ELEVENLABS_VOICE_ID`, dictation and spoken pronunciation refuse and everything
else works — the API says which are missing at boot. Word senses come from
WordNet on local disk, so the part that cards are grounded in needs no network
and no key at all.

## Layout

|                     |                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/web`          | Next.js. The compose box, the review, the card, the bank.                                                |
| `apps/api`          | NestJS. The two model calls, the dictionary, sessions, telemetry.                                        |
| `packages/shared`   | The wire contract and the pure logic both sides need. Zod schemas, span arithmetic, the word-level diff. |
| `evals`             | Scores the model calls against a committed baseline.                                                     |
| `scripts/deploy.sh` | Walks a deploy, step by step.                                                                            |
| `docs/deploy.md`    | Why the deploy is shaped the way it is.                                                                  |

Pure logic lives in `packages/shared` rather than in a component or a service,
because offset arithmetic and string matching corrupt output silently when they
are wrong, and that is the code most worth pinning with tests.

## Tests

```bash
pnpm test        # every runner
pnpm typecheck   # a separate gate: ts-jest does not run full diagnostics
```

Three runners, split by **filename** rather than by package — put a file in the
wrong one and it either fails to load or quietly stops being checked. The split
exists because `ai` and `@ai-sdk/openai` are ESM-only and jest's CommonJS
runtime cannot load them at all. See `.claude/skills/testing`.

## Evals

Nothing in the test suite says whether either model call is any _good_ — jest
and vitest mock the model out, which is right for testing wiring and useless for
testing output.

```bash
pnpm eval                # both suites, against the committed baseline
pnpm eval card --no-judge
```

Real cases, real prompts, real models, scored against `evals/results/baseline.json`,
exiting non-zero when a pass rate drops. It has caught two changes that looked
like improvements and were not. See `evals/README.md`.

## Deploying

```bash
./scripts/deploy.sh
```

Nine stages: it opens each page, says what to click, captures the keys and URLs
as they appear, and checks that health and CORS actually answer before moving
on. The order matters more than it looks — `NEXT_PUBLIC_API_URL` is inlined at
build time, so the API has to exist before the web app builds, and `WEB_ORIGIN`
cannot be set until the web app has a URL.

Sessions live in memory unless `REDIS_URL` is set, which is correct for a
checkout and caps the deploy at one instance. `render.yaml` provisions the
Redis and wires it.
