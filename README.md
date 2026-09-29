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

## Signing in

Optional, and off unless you configure it. Fixing sentences, opening cards,
banking words and hearing pronunciations all work signed out — an account
exists so that a word bank can later belong to a person rather than to a
browser.

Sign-in is a magic link: an address, an emailed link, no password. It needs a
Postgres for the users, sessions and unredeemed links.

```bash
cp apps/web/.env.example apps/web/.env.local

# Any Postgres will do. A throwaway one:
docker run -d --name auto-learn-pg -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=auto_learn -p 55432:5432 postgres:17-alpine

# In apps/web/.env.local:
#   DATABASE_URL=postgres://postgres:devpass@127.0.0.1:55432/auto_learn
#   AUTH_SECRET=$(openssl rand -base64 32)
#   API_JWT_SECRET=$(openssl rand -base64 32)   # same value in apps/api/.env

pnpm --filter web db:migrate
```

Leave `AUTH_RESEND_KEY` unset and the sign-in link is **printed to the server
console** instead of emailed, which is enough to click through the whole flow
without a Resend account or a verified sending domain.

The API authenticates nobody by itself and holds no user table. When the web app
needs to make a request as somebody, it mints a five-minute token signed with
`API_JWT_SECRET`, and `apps/api/src/auth/caller.guard.ts` verifies it. Only
`GET /me` asks for one today; every other route is open on purpose, because the
front door of this product does not need an account.

## Layout

|                     |                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/web`          | Next.js. The compose box, the review, the card, the bank, sign-in.                                       |
| `apps/api`          | NestJS. The two model calls, the dictionary, sessions, telemetry.                                        |
| `apps/web/db`       | The four tables Auth.js needs, and the script that applies them.                                        |
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
