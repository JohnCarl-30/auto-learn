# Deploying

Two services. The order matters, for one reason given below.

`scripts/deploy.sh` walks the whole procedure interactively — it opens each
page, says what to click, captures the URLs and keys as they appear, writes
them where they belong, and checks that health and CORS actually answer before
moving on. This document is the reasoning behind it; run the script and read
this when something surprises you.

## Before anything

The API cannot be serverless. It holds a session between `/propose` writing a
proposal and `/card` opening one of its gates: `/propose` stores each
`replacement` server-side and withholds it from the wire, and opening a card is
what releases it. It also streams both of those routes, holding a response open
for seconds at a time, and reads a 36MB WordNet database off disk.

Sessions live in Redis when `REDIS_URL` is set, which `render.yaml` provisions
and wires — so a card request may land in a process that never saw the
proposal. Without it the API keeps them in memory and works correctly on
exactly one instance, which is the right setup for a checkout and what the
tests run against.

Telemetry counters and rate-limiter state remain per-process. Neither breaks
across instances the way a missing session did: the counts under-report and the
limits become per-instance. Worth fixing when there is enough traffic for
either to matter.

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

`.github/workflows/telemetry.yml` reads `GET /telemetry` and appends the
snapshot to `telemetry/snapshots.jsonl`.

**Its hourly schedule is commented out.** It ran every hour from 17 September
and failed every time, because there was no deploy and so nothing to point
`API_URL` at — a hundred red runs saying only that the thing they measure does
not exist yet. Uncomment the `cron` line in the same change that sets the
variable below; until then the workflow runs by hand from the Actions tab.

Add a repository **variable** (not a secret — it is a URL, and secrets are
masked in logs, which makes failures hard to read) named `API_URL`, set to the
API's base URL.

Counters reset on every restart. `since` is in each snapshot, so a reset shows
as a new window rather than as numbers going backwards; sum the windows.

`GET /telemetry` is unauthenticated. There is no user data in it, but it is your
product metrics on an open URL. Worth a shared secret before you tell anyone the
address.

## Sign-in, if you want it

Optional, and shaped to stay optional. The web app owns accounts entirely: the
users table, the session cookie, the sign-in emails. The API owns none of it and
has no user table — when the web app needs to call it as somebody, it signs a
five-minute token with `API_JWT_SECRET` and the API verifies it.

That split is deliberate. The API is the half that holds model keys and talks to
providers; it is not the half that should hold people's identities. It also means
the API needs no database of its own and no session lookup on a request, and that
every existing route stays open — signing in is a thing you can add without
anything that works today beginning to require it.

Three things go wrong here, in this order of likelihood:

1. **`API_JWT_SECRET` differs between Vercel and Render.** Every signed-in
   request 401s and the only clue is "Sign in again to do that."
2. **The tables were never created.** `pnpm --filter web db:migrate` has to run
   once against the production database. Until it does, clicking a sign-in link
   is a 500.
3. **The from-address is at an unverified domain.** Resend accepts the key and
   refuses the message; the failure is in the function log, not on the page.

The bank syncs through `POST /api/bank/sync` on the web app, not through the
API — a bank is user data, and the API holds none. One consequence worth knowing
before someone reports it as a bug: a word picked up on a second device has no
sentence under it, because sentences never leave the browser they were written
in. The drill falls back to the definition and says why.

Without `AUTH_RESEND_KEY` the link is written to the runtime log instead of
emailed. That is a real way to run a demo, and a bad way to run anything with
users in it — the link is a credential, and a log is not private.

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

`dictations` against `dictationsFailed` says whether voice works for the people
trying it. Read together, always: a feature that is failing produces the same
low success count as a feature nobody wants, and those two call for opposite
decisions.

`editsDropped` is the fourth number, and it qualifies the other three. An edit
whose span cannot be located verbatim is discarded rather than guessed at, so a
model that drifts produces *fewer gates* rather than an error — which reads as
quiet success. Watch it as a share of `proposals`: a few per paste is ordinary,
a rising ratio means the prompt or the model has moved and the other counts are
measuring a product that is quietly getting thinner.

## Costs

`/propose` and `/card` each spend a model call, behind no login unless the
deploy sets `REQUIRE_SIGN_IN=true` (see below). The per-IP limits in
`common/rate-limit.ts` bound one caller, not a distributed one. Cap the spend
too — OpenAI sets budgets per project, not per key, so give the deploy its own
project, cap that, and make the key inside it (the steps are under OpenAI
below). The rate limit protects against a script, the cap protects against
everything else.

Sign-in adds a Postgres and an email provider. Both are free at this size —
users, sessions and unredeemed links are a few kilobytes per person, and the
only mail sent is one link per sign-in. Note that accounts alone do not reduce
the model spend above: an account is not a gate, and `/propose` stays open to
anyone unless `REQUIRE_SIGN_IN=true` is set, which is what the free setup
below does.

## Free, for one person

Everything above is shaped for a service other people use. One person on an
iPhone needs none of it bought, so this is the same two services set by hand on
free plans. It is settings rather than a second blueprint: `render.yaml` stays
the paid one, and nothing here edits it. `scripts/deploy.sh` follows that paid
blueprint (a starter instance and a Redis), so it is not for this setup; work
through the sections below by hand.

This reverses a choice made in step 1, so the reason is worth stating. The
`starter` plan exists because a sleeping instance zeroes the telemetry counters,
and the counters are what a public deploy is read by. One person is not
a sample; skip step 4 and the counters stop mattering. What a free instance
costs instead is the sleep itself, described under Render below.

Free tiers move, so each was checked against the provider's own page on
2026-10-30 rather than recalled: Render (`render.com/pricing`,
`render.com/docs/free`), Neon (`neon.com/pricing`), Resend
(`resend.com/pricing`). Recheck them before relying on a number.

Order: Neon and Resend first, because they hand you keys; then Render, which
hands you the URL Vercel needs at build time; then Vercel; then back to Render
for `WEB_ORIGIN`. It is the same reason as in step 2.

### Neon

A free project. Copy its connection string; that is `DATABASE_URL`. The free
plan is $0 with 1 GB per project, and its compute suspends after 5 minutes
idle, so the first sign-in after a quiet spell is slower. That is the database
waking, not a fault.

Create the tables once, from your checkout (run `pnpm install` there first, as
the script needs `pg`):

```
DATABASE_URL='<the Neon connection string>' pnpm --filter web db:migrate
```

That runs `apps/web/db/migrate.mjs` and prints `Schema applied.` The script also
reads `apps/web/.env.local`, which git ignores, if you would rather keep the
string there than in your shell history. Skipping this is failure 2 above: every
sign-in link is a 500.

### Resend

A free account: 3,000 emails a month and 100 a day, far more than one person
signing in. Make an API key; that is `AUTH_RESEND_KEY`.

Keep `AUTH_EMAIL_FROM` as `auto-learn <onboarding@resend.dev>`. That shared
address needs no verified domain, and Resend only lets it deliver to the email
address of the Resend account itself. For one person that is a feature: sign in
with the address you registered at Resend, and nobody else's link is ever
sent. A different address is refused with a 403, and the failure is in the
Vercel function log, not on the page, like the unverified-domain case above.

### Render

Create the service by hand (New → Web Service, pointed at the repo), not from
the blueprint, which would also provision the paid Redis. Leave Root Directory
empty, as with Vercel. Then:

| Setting | Value |
|---|---|
| Instance type | Free |
| Build Command | `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @auto-learn/shared build && pnpm --filter api build` |
| Start Command | `node apps/api/dist/main.js` |
| Health Check Path | `/health` |

The build and start commands are the ones in `render.yaml`, and the health path
is exempt from rate limiting for the same reason as in step 1. Environment:

| Variable | Value |
|---|---|
| `NODE_VERSION` | `22`. Render's default has moved on, and the blueprint pins 22. |
| `OPENAI_API_KEY` | Your key. The only thing here that costs money. |
| `API_JWT_SECRET` | `openssl rand -base64 32`. Vercel needs the same value. |
| `REQUIRE_SIGN_IN` | `true`, exactly. |
| `WEB_ORIGIN` | The Vercel URL, once it exists (below). |

**`REQUIRE_SIGN_IN` must be exactly `true`.** It is the whole of what keeps a
stranger from spending your key: with it on, `/converse`, `/propose`, `/card`,
`/dictate` and `/speak` refuse any request without a token the web app signed.
Any other value (`TRUE`, `1`, `yes`) leaves every route open. The API says which
state it is in at boot and warns when the variable is set to something other
than `true`, so read the first lines of the log once.

Leave `REDIS_URL` and the ElevenLabs keys unset. Without Redis, sessions live in
memory, which is correct on exactly one instance, and a free service cannot run
more than one. Without the
ElevenLabs pair, dictation transcribes with OpenAI instead, and the API logs a
boot warning for what is missing: synthesised pronunciation of a word the
dictionary has no recording for returns 502. That warning is expected here.

**It sleeps.** Render spins a free service down after 15 minutes with no inbound
traffic, and the next request takes about a minute to wake it (Render's own
figure; allow 30 to 60 seconds). Every wake is a new process, so a gate opened
from before the sleep finds no session and answers `That session has expired.`
Render may also restart a free service at any time, with the same result. It is
a resubmit, not lost work: send the sentence again. The 750 free instance hours
a month are not a constraint, because a spun-down service draws none.

### Vercel

As in step 2, with the Root Directory at the repo root. Environment:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | The Render URL, without a trailing slash. Inlined at build, so set it before the first build. |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `DATABASE_URL` | The Neon connection string. |
| `AUTH_RESEND_KEY` | The Resend API key. |
| `AUTH_EMAIL_FROM` | `auto-learn <onboarding@resend.dev>` |
| `API_JWT_SECRET` | The same value as on Render. A mismatch is failure 1 above. |

Then set `WEB_ORIGIN` on Render to the Vercel URL (scheme and host, no trailing
slash: `main.ts` allows exactly that one origin) and let it restart.

To see that the lock is on, post to the API with no token:

```
curl -s -X POST https://<render-url>/converse -H 'Content-Type: application/json' -d '{}'
```

It should answer 401 with `"code":"sign_in_required"`. The first call after a
sleep is the slow one.

### OpenAI

OpenAI limits are set per project, not per key. Create a project in the OpenAI
dashboard for this deploy, cap its monthly budget, and make the key for
`OPENAI_API_KEY` inside that project. Use that key for the deployed app only:
never for evals, never as a CI secret. The sign-in lock keeps strangers out;
the cap bounds the rest, such as a leaked token or a loop. This is the one
running cost, and it is the same advice as under Costs.

Set the cap knowing which models run, because they are not the ones the
design's estimate assumed. That estimate ("under $1/month") was priced on
`gpt-4o-mini`; `apps/api/src/llm/config.ts` actually runs `gpt-5.6-luna` for
replies and reviews (`/converse`, `/propose`) and `gpt-5.6-terra` for word cards
(`/card`), at the prices listed there, plus `gpt-4o-mini-transcribe` when the
phone falls back to recording. Expect the monthly bill to be higher than the
design's estimate, and pick the cap from what you are willing to spend, not
from that figure. The models are a deliberate choice and are not changed by
this setup.

### iPhone

iOS keeps a home-screen app's cookies separate from Safari's. Tapping the
emailed sign-in link opens it in Safari, which signs in Safari and leaves the
installed app signed out, so every call that spends the key would come back
401. The link is pasted into the app instead:

1. Open the Vercel URL in Safari, tap Share, then Add to Home Screen.
2. Open the app from the home screen.
3. Tap Sign in and request a link with the Resend account's email. The app
   shows "Check your email" with a **Paste your sign-in link** field.
4. In Mail, long-press the link and choose Copy Link. Do not tap it.
5. Switch back to the app, paste the link into the field and tap Sign in.
   The link works once and expires 15 minutes after it was sent.
6. Allow the microphone when asked.

The field only accepts a sign-in link for this same site (an `/api/auth/callback/`
address on the Vercel URL); anything else is refused with a message and never
opened. If your mail provider rewrites links (click tracking, safe-links
scanning), the copied link points elsewhere and will be refused; turn the
rewriting off for these mails or use the fallback.

Fallback: skip the home-screen app and use it in a Safari tab. Tapping the
link then signs in that same Safari, and everything works there.

**Not yet verified on a device.** The paste flow is built and unit-tested, but
nobody has run it on an iPhone yet. The first real deploy will settle whether
it works as written, and this section gets updated then; until it has, treat
the steps above as the intended flow, not a tested one.
