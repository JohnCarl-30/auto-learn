# Deploying

Two services. The order matters, for one reason given below.

## Before anything

The API cannot be serverless, and cannot be scaled past one instance.

`SessionStore`, `TelemetryService` and the rate limiter all hold state in
memory. The session one is load-bearing: `/propose` stores each `replacement`
server-side and withholds it from the wire, and opening a card is what releases
it. On a second instance, the card request lands in a process that never saw the
proposal, and the product's central mechanic returns `session_not_found`.

`session.store.ts` says the same thing: it becomes Redis when there is more than
one instance. Until then, one process.

## 1. API → Render

`render.yaml` at the repo root is a blueprint; point Render at the repo and it
reads it. What the file cannot carry:

- `OPENAI_API_KEY` — set it in the dashboard, `sync: false` keeps it out of git.
- `WEB_ORIGIN` — you do not have it yet. Step 3.
- `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` — voice. Leave them unset and
  dictation and spoken pronunciation refuse, with everything else working; the
  API says which are missing at boot. The voice id is account-scoped, so take it
  from My Voices rather than reusing one from anywhere else.

The plan is `starter` rather than `free` deliberately. Free instances sleep when
idle, and every wake is a fresh process with zeroed telemetry counters — which
defeats the reason for deploying at all.

Health checks hit `/health`, which is exempt from rate limiting. A limited
health check would eventually take a 429, and the host reads that as
"unhealthy" and restarts a service that was working.

Take the service URL when it comes up.

## 2. Web → Vercel

`vercel.json` at the repo root sets the build. **Set the project's Root
Directory to the repo root, not `apps/web`** — the build has to compile
`packages/shared` first, and it cannot reach outside the root directory.

Set `NEXT_PUBLIC_API_URL` to the API URL from step 1.

**This is why the order matters.** `NEXT_PUBLIC_*` is inlined at build time, not
read at runtime. The API URL has to be known before the web app builds, and
changing it later means rebuilding — not editing an env var and restarting.

## 3. Back to Render

Set `WEB_ORIGIN` to the Vercel URL and let it restart. Until this, the browser's
requests fail CORS.

`main.ts` allows exactly one origin. Vercel gives every preview deployment its
own URL, so previews will be blocked against the production API. That is
tolerable — or widen the check to a pattern, knowingly.

## 4. Telemetry

`.github/workflows/telemetry.yml` reads `GET /telemetry` hourly and appends the
snapshot to `telemetry/snapshots.jsonl`.

Add a repository **variable** (not a secret — it is a URL, and secrets are
masked in logs, which makes failures hard to read) named `API_URL`, set to the
API's base URL.

Counters reset on every restart. `since` is in each snapshot, so a reset shows
as a new window rather than as numbers going backwards; sum the windows.

`GET /telemetry` is unauthenticated. There is no user data in it, but it is your
product metrics on an open URL. Worth a shared secret before you tell anyone the
address.

## What to watch

The three counts that decide v2, from `packages/shared/src/telemetry.ts`:

| Question | Field |
|---|---|
| Do people arrive with essays? | `overflowAttempts` |
| Do they engage the gate at all? | `cardsDelivered` against `proposals` |
| Do they take the suggestions? | `accepted` against `rejected` |

Read `cardsDelivered`, not `cardsRequested`: the two differ whenever the model
or the dictionary fails, and a failure is not engagement. `cardsFailed` is the
one to watch for a different reason — if it climbs, the gate is breaking rather
than teaching.

`editsDropped` is the fourth number, and it qualifies the other three. An edit
whose span cannot be located verbatim is discarded rather than guessed at, so a
model that drifts produces *fewer gates* rather than an error — which reads as
quiet success. Watch it as a share of `proposals`: a few per paste is ordinary,
a rising ratio means the prompt or the model has moved and the other counts are
measuring a product that is quietly getting thinner.

## Costs

`/propose` and `/card` each spend a model call, behind no login. The per-IP
limits in `common/rate-limit.ts` bound one caller, not a distributed one. Set a
spend cap on the OpenAI key too — the rate limit protects against a script, the
cap protects against everything else.
