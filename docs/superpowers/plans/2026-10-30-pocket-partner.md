# Pocket partner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/talk` an installable app John can talk to from an iPhone and a laptop, with a word to practise each session, deployed on free hosting behind sign-in.

**Architecture:** The API gains an opt-in sign-in lock (`REQUIRE_SIGN_IN`) on every route that spends the OpenAI key, and transcribes with OpenAI when ElevenLabs is not configured. The web client attaches the token it can already mint (`/api/auth/api-token`), prefers the browser's own speech recognition and falls back to recording + `/dictate`, and picks a session word from the bank or asks the API for one. A web manifest makes it installable.

**Tech Stack:** NestJS 11 + AI SDK (`ai`, `@ai-sdk/openai` 4.0.42), Next.js App Router, IndexedDB bank synced to Postgres, Auth.js magic links, jest + vitest (API), jest + RTL (web), vitest (shared).

**Spec:** `docs/superpowers/specs/2026-10-30-pocket-partner-design.md`

## Global Constraints

- Free hosting only: Vercel Hobby (web), Render free web service (API, one instance, no Redis), Neon free Postgres, Resend free tier.
- The only running cost is John's OpenAI key. Never use it for evals, never set it as a CI secret.
- No ElevenLabs on the deployed site; the ElevenLabs path must keep working when its keys are set.
- Corrections stay under the turn, after the learner finishes. The gate stays: replacements are never shown before `/card`.
- Match the codebase: heavily commented (explain *why*), Zod contracts in `packages/shared`, API `*.spec.ts` = jest (mock `ai`), `*.test.ts` = vitest, web = jest + RTL.
- Words join the bank only on evidence of use (`addedVia: 'accepted'`), never when offered.
- Keep `render.yaml` (paid blueprint) as it is; the free setup is documented, not swapped in.

## Review Focus

1. **Expired token mid-conversation** (`API_TOKEN_TTL_SECONDS` = 5 min): a turn sent after 5 minutes must refresh the token and succeed, not show "sign in". Pinned in Task 2.
2. **Safari recording format:** the installed iPhone app records `audio/mp4`; `/dictate` must accept it and pass it to OpenAI. Pinned in Task 3.
3. **Speech permission refused vs. service unavailable:** `service-not-allowed` must switch to the recorder; `not-allowed` (mic permission denied) must show the permission message, not loop. Pinned in Task 4.
4. **Session word with no review:** a turn over three sentences comes back with `review: null`; using the suggested word there marks it used but must not try to open a card. Pinned in Task 5.
5. **Sleeping API:** after Render's free instance sleeps, in-memory sessions are gone; opening a gate from an old turn returns `session_not_found` and must show the existing message, not crash. Covered by existing card tests; verify by hand in Task 7.

---

### Task 1: Sign-in lock on the API

**Files:**
- Modify: `packages/shared/src/errors.ts` (add `'sign_in_required'` to `ApiErrorCode`)
- Create: `apps/api/src/auth/signed-in.guard.ts`
- Test: `apps/api/src/auth/signed-in.guard.spec.ts`
- Modify: `apps/api/src/converse/converse.controller.ts`, `apps/api/src/propose/propose.controller.ts`, `apps/api/src/card/card.controller.ts`, `apps/api/src/dictate/dictate.controller.ts`, `apps/api/src/speech/speech.controller.ts` (add `@UseGuards(SignedInGuard)` at class level)
- Modify: `apps/api/.env.example` (add `REQUIRE_SIGN_IN=` with a comment), `apps/api/src/main.ts` (log whether the lock is on)

**Interfaces:**
- Produces: `class SignedInGuard extends CallerGuard` — `canActivate(context): boolean`. When `process.env.REQUIRE_SIGN_IN !== 'true'` it returns `true` without reading headers. Otherwise it runs `CallerGuard.canActivate` and converts any `UnauthorizedException` into `HttpException({ code: 'sign_in_required', message }, 401)` where `message` is `'Sign in to use auto-learn here.'`.
- Produces: `ApiErrorCode` includes `'sign_in_required'`.

- [ ] **Step 1: Write the failing tests** in `signed-in.guard.spec.ts`, building an `ExecutionContext` stub around a fake request with `header(name)`:
  - `it('lets every request through when REQUIRE_SIGN_IN is unset')` → `canActivate` returns `true` with no `authorization` header.
  - `it('refuses a request with no token when the lock is on')` → with `REQUIRE_SIGN_IN='true'`, `API_JWT_SECRET='s'`, throws; `getResponse()` equals `{ code: 'sign_in_required', message: 'Sign in to use auto-learn here.' }` and `getStatus()` is `401`.
  - `it('accepts a valid token and records the caller')` → token signed with `jsonwebtoken.sign({}, 's', { subject: 'u1', issuer: API_TOKEN_ISSUER, audience: API_TOKEN_AUDIENCE, algorithm: 'HS256' })`; returns `true` and `request.caller` equals `{ id: 'u1' }`.
  - `it('refuses an expired token with sign_in_required')` → token with `expiresIn: -1`; same 401 body as above.
  Restore `process.env` after each test.
- [ ] **Step 2: Run and see them fail.** `pnpm --filter api test:jest -- signed-in.guard` → FAIL, cannot find module `./signed-in.guard`.
- [ ] **Step 3: Add `'sign_in_required'` to `ApiErrorCode`, implement `SignedInGuard`, and put it on the five controllers.** `/telemetry`, `/health` and `/me` stay as they are.
- [ ] **Step 4: Run the API and shared suites.** `pnpm --filter @auto-learn/shared build && pnpm --filter api test && pnpm --filter api typecheck` → all pass (existing controller tests run with the flag unset).
- [ ] **Step 5: Commit.** `git commit -m "feat(api): lock the routes that spend the key behind sign-in when REQUIRE_SIGN_IN is set"`

---

### Task 2: Web client sends the API token

**Files:**
- Create: `apps/web/lib/api-token.ts`
- Test: `apps/web/lib/api-token.test.ts`
- Modify: `apps/web/lib/api.ts` (`post`, `get`, `openStream`, `dictate`, `speak` send the header; `reportEvent` does not)
- Test: `apps/web/lib/api.test.ts` (add cases)

**Interfaces:**
- Consumes: `GET /api/auth/api-token` → `ApiToken { token, expiresIn }` or 401 (`apps/web/app/api/auth/api-token/route.ts`, unchanged).
- Produces: `getApiToken(options?: { fresh?: boolean }): Promise<string | null>` — cached in module scope until 60 s before expiry; `null` when signed out (401) or the route fails. `authHeaders(options?: { fresh?: boolean }): Promise<Record<string, string>>` — `{ Authorization: 'Bearer <token>' }` or `{}`. `resetApiToken(): void` for tests and sign-out.

- [ ] **Step 1: Write the failing tests** in `api-token.test.ts` (mock `global.fetch`, fake timers):
  - `it('fetches once and reuses the token until a minute before it expires')` → two calls within 3 min hit fetch once; a call at 4 min 1 s fetches again (`expiresIn: 300`).
  - `it('returns null when signed out')` → route answers 401 → `null`, and `authHeaders()` is `{}`.
  - `it('fetches a new token when asked for a fresh one')`.
  In `api.test.ts`:
  - `it('sends the bearer token on converse')` → `fetch` for `/converse` receives `Authorization: 'Bearer t1'`.
  - `it('retries once with a fresh token after sign_in_required')` → first `/converse` answers 401 `{ code: 'sign_in_required', ... }`, token route then returns `t2`, second `/converse` succeeds; the result resolves and exactly two `/converse` requests were made.
  - `it('surfaces sign_in_required when the retry also fails')` → rejects with `ApiFailure` whose `detail.code` is `'sign_in_required'`.
- [ ] **Step 2: Run and see them fail.** `pnpm --filter web test -- api-token api.test` → FAIL.
- [ ] **Step 3: Implement `api-token.ts` and wire `api.ts`.** One shared `send(path, init)` helper in `api.ts` adds `authHeaders()` and does the single retry on `sign_in_required` with `{ fresh: true }`; `post`, `get`, `openStream` and `dictate` call it so there is still exactly one `ApiError.safeParse` (in `handle`). `dictate` must keep `Content-Type` unset.
- [ ] **Step 4: Show the refusal usefully.** In `apps/web/components/notice.tsx` `toneFor`, treat `'sign_in_required'` like the other "do something" codes, and render a "Sign in" link to `/signin` next to the message when the code is `sign_in_required`. Add one case to `notice.test.tsx`: `it('links to sign-in when sign-in is required')`.
- [ ] **Step 5: Run the web suite and typecheck.** `pnpm --filter web test && pnpm --filter web typecheck` → pass.
- [ ] **Step 6: Commit.** `git commit -m "feat(web): send the API token with every call that spends the key"`

---

### Task 3: OpenAI transcription when ElevenLabs is not set

**Files:**
- Modify: `apps/api/src/llm/config.ts` (add `OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe'`; add `openai: { language: 'en' }` to `transcribeProviderOptions`)
- Modify: `apps/api/src/llm/models.ts` (`transcribeModel()`)
- Modify: `apps/api/src/main.ts` (`checkApiKeys` wording: dictation now works with OpenAI alone; only synthesised pronunciation needs ElevenLabs)
- Test: `apps/api/src/llm/models.test.ts` (vitest, real SDK), `apps/api/src/dictate/dictate.controller.spec.ts` (create if absent)

**Interfaces:**
- Produces: `transcribeModel()` returns `elevenLabs.transcription(TRANSCRIBE_MODEL)` when `process.env.ELEVENLABS_API_KEY` is set, otherwise `openai.transcription(OPENAI_TRANSCRIBE_MODEL)`. Read at call time, not import time.

- [ ] **Step 1: Write the failing tests.** In `models.test.ts`:
  - `it('transcribes with OpenAI when ElevenLabs is not configured')` → with `ELEVENLABS_API_KEY` deleted, `transcribeModel().modelId` is `'gpt-4o-mini-transcribe'` and `provider` contains `'openai'`.
  - `it('keeps ElevenLabs when its key is set')` → `modelId` is `TRANSCRIBE_MODEL` (`'scribe_v2'`).
  In `dictate.controller.spec.ts`:
  - `it('accepts an audio/mp4 recording, which is what Safari records')` → controller with a stub service; a file with `mimetype: 'audio/mp4'` and a non-empty buffer reaches `service.dictate`.
- [ ] **Step 2: Run and see them fail.** `pnpm --filter api test:vitest -- models` → FAIL on the OpenAI case. (The mp4 case may already pass; keep it as a guard.)
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `pnpm --filter api test && pnpm --filter api typecheck` → pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(api): transcribe with OpenAI when ElevenLabs is not configured"`

---

### Task 4: Browser speech recognition first, recorder as fallback

**Files:**
- Create: `apps/web/lib/speech-recognition.ts`
- Modify: `apps/web/lib/use-dictation.ts`
- Test: `apps/web/lib/use-dictation.test.tsx`

**Interfaces:**
- Produces (`speech-recognition.ts`): a minimal local type `BrowserRecognition` (the members used: `lang`, `interimResults`, `continuous`, `maxAlternatives`, `start()`, `stop()`, `abort()`, `onresult`, `onerror`, `onend`) and `recognitionConstructor(): (new () => BrowserRecognition) | null` returning `window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null`.
- Produces (`useDictation`): same return shape as today, `{ status, problem, start, stop }`, plus `engine: 'browser' | 'recorder'`. `status` is `'recording'` while listening in either engine; `'transcribing'` only on the recorder path.

Behaviour to implement:
- Use the browser engine when `recognitionConstructor()` is non-null and the hook has not fallen back this session. Settings: `lang = 'en-US'`, `interimResults = false`, `continuous = false`, `maxAlternatives = 1`. One instance per press (push-to-talk). The final transcript goes to the same `onTranscript` callback.
- `onerror` with `'service-not-allowed'` or `'audio-capture'`: switch `engine` to `'recorder'` for the rest of the hook's life and start the recorder right away for this press.
- `onerror` with `'not-allowed'`: set `problem` to the existing `NO_PERMISSION` message; do not fall back.
- `onerror` with `'no-speech'`: set `problem` to `"I didn't hear anything. Try again."`.
- `stop()` calls `recognition.stop()` on the browser engine.

- [ ] **Step 1: Write the failing tests** with a fake `webkitSpeechRecognition` class on `window` that records calls and lets the test fire `onresult` / `onerror`:
  - `it('uses the browser recogniser when there is one and never calls /dictate')` → start, fire a result `'I went yesterday'`, `onTranscript` gets it, `fetch` not called.
  - `it('switches to recording when the browser service is not allowed')` → fire `onerror({ error: 'service-not-allowed' })`; `engine` becomes `'recorder'` and `MediaRecorder.start` is called.
  - `it('shows the permission message and does not fall back when the mic is refused')` → `onerror({ error: 'not-allowed' })`; `problem.message` is `NO_PERMISSION`; `engine` stays `'browser'`.
  - Existing recorder tests keep passing with `webkitSpeechRecognition` absent (delete it in their `beforeEach`).
- [ ] **Step 2: Run and see them fail.** `pnpm --filter web test -- use-dictation` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `pnpm --filter web test && pnpm --filter web typecheck` → pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): listen with the browser's own recogniser, record only when it can't"`

---

### Task 5: A word to practise each session

**Files:**
- Modify: `packages/shared/src/converse.ts` (add `SessionWordRequest`, `SessionWord`, `SessionWordResponse`)
- Modify: `packages/shared/src/reuse.ts` (export `inflectionsOf`; add `findUsedForm`)
- Test: `packages/shared/src/reuse.test.ts`
- Modify: `apps/api/src/llm/prompts.ts` (add `SESSION_WORD_SYSTEM_PROMPT`, `sessionWordUserPrompt`)
- Modify: `apps/api/src/converse/converse.service.ts`, `converse.controller.ts`, `converse.module.ts` (import `DictionaryModule`), `apps/api/src/common/rate-limit.ts` (`sessionWord: { ttl: minutes(1), limit: 5 }`)
- Test: `apps/api/src/converse/converse.service.spec.ts`
- Create: `apps/web/lib/session-word.ts`
- Test: `apps/web/lib/session-word.test.ts`
- Modify: `apps/web/lib/api.ts` (`suggestWord`), `apps/web/lib/use-conversation.ts`, `apps/web/components/talk-panel.tsx`
- Test: `apps/web/components/talk-panel.test.tsx`

**Interfaces:**
- Shared:
  - `SessionWordRequest = z.object({ scenario: Scenario, known: z.array(z.string()).max(MAX_KNOWN_WORDS) })`
  - `SessionWord = z.object({ word: z.string(), definition: z.string() })`
  - `SessionWordResponse = z.object({ word: SessionWord.nullable() })`
  - `findUsedForm(sentence: string, lemma: string): string | null` — the token as written (punctuation stripped, original case kept) whose bare lowercase form is `lemma` or one of its inflections; `null` when absent.
- API: `POST /converse/word` → `SessionWordResponse`, guarded by `SignedInGuard` (class level from Task 1) and throttled with `RATE_LIMITS.sessionWord`. `ConverseService.suggestWord(request: SessionWordRequest): Promise<SessionWordResponse>`: one `generateText` call with `converseModel()` asking for a single English word useful in that scenario, a step above everyday vocabulary, not in `known`; trim to the first word, lowercase; `DictionaryService.lookup(word)`; `'found'` → `{ word: { word, definition: <first WordNet sense's gloss> } }`; `'absent'` / `'unavailable'` / model error → `{ word: null }` (never a 5xx: a missing word must not block talking).
- Web:
  - `STALE_AFTER_MS = 24 * 60 * 60 * 1000`
  - `pickBankWord(entries: BankEntry[], now: Date): BankEntry | null` — entries whose `lastReusedAt` is `null` or older than `STALE_AFTER_MS`; among them never-reused first (oldest `addedAt` first), then oldest `lastReusedAt`. `null` if none.
  - `type PracticeWord = { word: string; lemma: string; definition: string; banked: boolean; used: boolean }`
  - `suggestWord(body: SessionWordRequest): Promise<SessionWordResponse>` in `api.ts`.
  - `useConversation` returns `practiceWord: PracticeWord | null` in addition to its current fields.

Behaviour in `useConversation`:
- On `start(scenario)`: `pickBankWord(await listBank(), new Date())` → `practiceWord` from it (`banked: true`, `lemma` = entry lemma). Otherwise `suggestWord({ scenario, known: await knownWords() })` → `banked: false`, `lemma` = the word. Any failure → `practiceWord` stays `null`, silently.
- In `send()`, before `converse(...)`: `recordReuse(utterance)` (as `use-review.ts` does), bumping `bankVersion` on hits. A banked practice word is counted there and nowhere else, so it counts once; set `used: true` when its lemma is among the hits.
- After the reply arrives, for an unbanked practice word: find the first sentence of `splitSentences(utterance)` where `findUsedForm(sentence, lemma)` is non-null. If found, set `used: true`. If `result.review` is non-null, `fetchCard({ kind: 'lookup', sessionId: result.review.sessionId, sentenceIndex, word: form })`; when the response is `kind: 'card'`, `bankWord(response.card, utterance, 'accepted')`, set `banked: true`, bump `bankVersion`. Card failures are silent (the word stays practice-only).

UI in `TalkPanel`: under the scenario row, when `practiceWord` is set, a line `Try using: <word> — <definition>`; after use, `You used it.` and, if it was just banked, `Added to your bank.`. `data-testid="practice-word"`.

- [ ] **Step 1: Write the failing shared test** in `reuse.test.ts`: `findUsedForm('We should Mitigate it.', 'mitigate')` → `'Mitigate'`; `findUsedForm('They mitigated the risk', 'mitigate')` → `'mitigated'`; `findUsedForm('Nothing here', 'mitigate')` → `null`.
- [ ] **Step 2: Write the failing API tests** in `converse.service.spec.ts` (mock `ai` and a stub `DictionaryService`):
  - `it('suggests a word the dictionary knows')` → model text `'Mitigate.'`, lookup `found` with gloss `'make less severe'` → `{ word: { word: 'mitigate', definition: 'make less severe' } }`.
  - `it('returns no word when the dictionary has never heard of it')` → lookup `absent` → `{ word: null }`.
  - `it('returns no word instead of failing when the model errors')` → `generateText` rejects → `{ word: null }`.
  - `it('tells the model which words the learner already has')` → the prompt passed to `generateText` contains each of `known`.
- [ ] **Step 3: Write the failing web tests.**
  `session-word.test.ts`:
  - `it('prefers a word never reused, oldest first')`
  - `it('skips words reused in the last day')`
  - `it('returns null when every word was reused today')`
  `talk-panel.test.tsx` (mock `@/lib/api` and `@/lib/bank`):
  - `it('shows a bank word to practise when the bank has one')`
  - `it('asks for a word when the bank is empty and shows it')`
  - `it('banks a suggested word after the learner uses it')` → `converse` returns a review with `sessionId: 's1'`; utterance contains `'mitigated'`; asserts `fetchCard` called with `{ kind: 'lookup', sessionId: 's1', sentenceIndex: 0, word: 'mitigated' }`, `bankWord` called with `'accepted'`, and `Added to your bank.` is shown.
  - `it('marks the word used but opens no card when the turn had no review')` → `review: null`, `skipped: 'too_many_sentences'`; `You used it.` shown; `fetchCard` not called.
  - `it('still lets you talk when no word could be found')` → `suggestWord` rejects; no `practice-word`; sending a turn works.
- [ ] **Step 4: Run and see them fail.** `pnpm --filter @auto-learn/shared test && pnpm --filter api test:jest -- converse && pnpm --filter web test -- session-word talk-panel` → FAIL.
- [ ] **Step 5: Implement shared, then API, then web.** Rebuild shared before the API and web runs: `pnpm --filter @auto-learn/shared build`.
- [ ] **Step 6: Run everything.** `pnpm test && pnpm typecheck` → pass.
- [ ] **Step 7: Commit.** `git commit -m "feat: a word to practise in each conversation, banked once it is used"`

---

### Task 6: Open straight into talking, installable, phone-sized

**Files:**
- Create: `apps/web/app/manifest.ts`, `apps/web/public/icon-192.png`, `apps/web/public/icon-512.png`, `apps/web/app/apple-icon.png` (180×180)
- Modify: `apps/web/app/layout.tsx` (metadata `appleWebApp: { capable: true, title: 'auto-learn', statusBarStyle: 'default' }`; `export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }`)
- Modify: `apps/web/app/talk/page.tsx` (padding `px-4 py-6 sm:px-6 sm:py-16`)
- Modify: `apps/web/components/talk-panel.tsx` (start in `'free-talk'` on first mount; a "Change" button returns to the picker; the composer form is `sticky bottom-0` with `pb-[env(safe-area-inset-bottom)]` and a background)
- Test: `apps/web/components/talk-panel.test.tsx`

**Interfaces:**
- Produces: `manifest(): MetadataRoute.Manifest` with `name: 'auto-learn'`, `short_name: 'auto-learn'`, `start_url: '/talk'`, `display: 'standalone'`, the two icons, `background_color` / `theme_color` taken from the light theme in `globals.css`.

No service worker. Add the comment `// shortcut: no service worker, so nothing works offline; add one if offline practice is ever wanted.` in `manifest.ts`.

Icons: generate simple placeholder PNGs (the letters "al" on the theme colour) with a script outside the repo or any local tool; they only need to exist at the right sizes.

- [ ] **Step 1: Write the failing tests** in `talk-panel.test.tsx`:
  - `it('opens straight into Just talk without picking a room')` → render; the scenario label shows `'Just talk'` and the composer is present; the picker is not.
  - `it('goes back to the room picker from Change')`.
- [ ] **Step 2: Run and see them fail.** `pnpm --filter web test -- talk-panel` → FAIL.
- [ ] **Step 3: Implement** the panel changes, layout metadata, manifest and icons.
- [ ] **Step 4: Verify the manifest is served.** `pnpm --filter web build && pnpm --filter web start -p 3417 &` then `curl -s localhost:3417/manifest.webmanifest` → JSON with `"start_url":"/talk"` and `"display":"standalone"`. Stop the server.
- [ ] **Step 5: Run.** `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint` → pass.
- [ ] **Step 6: Commit.** `git commit -m "feat(web): installable, opens into Just talk, composer within thumb reach"`

---

### Task 7: Free deploy for one person

**Files:**
- Modify: `docs/deploy.md` (new section "Free, for one person")
- Modify: `apps/web/.env.example` (comment that `AUTH_EMAIL_FROM` on `onboarding@resend.dev` only delivers to the Resend account owner)

The section documents, as settings rather than a second blueprint:
- **Render:** create a Web Service by hand (not the blueprint), plan **Free**, same build and start commands as `render.yaml`, Node 22, health check `/health`. Env: `OPENAI_API_KEY`, `WEB_ORIGIN` (the Vercel URL), `API_JWT_SECRET`, `REQUIRE_SIGN_IN=true`. No `REDIS_URL`, no ElevenLabs keys. Note: it sleeps after idle; the first request takes 30–60 s and open gates from before the sleep are gone.
- **Neon:** free project; `DATABASE_URL`; run `apps/web/db/migrate.mjs` once.
- **Resend:** free; `AUTH_RESEND_KEY`; sign in with the Resend account's own email.
- **Vercel:** `NEXT_PUBLIC_API_URL` (Render URL), `AUTH_SECRET`, `DATABASE_URL`, `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM`, `API_JWT_SECRET` (same value as Render).
- **OpenAI:** set a monthly usage limit on the key in the OpenAI dashboard.
- **iPhone:** open the Vercel URL in Safari → Share → Add to Home Screen → open it, sign in, allow the microphone.

- [ ] **Step 1: Before writing, confirm the free tiers still exist.** Check Render's and Neon's pricing pages; if either has no free tier, stop and report to John instead of documenting it.
- [ ] **Step 2: Write the section and the env comment.**
- [ ] **Step 3: Commit.** `git commit -m "docs: deploy for free, for one person"`
- [ ] **Step 4: Deploy with John.** They create the Render, Neon, Resend and Vercel accounts and pastes the keys himself; the agent never sees or prints secrets. Then verify by hand:
  - `curl -s https://<render-url>/health` → ok.
  - `curl -s -X POST https://<render-url>/converse -H 'Content-Type: application/json' -d '{}'` → 401 with `"code":"sign_in_required"`.
  - On the iPhone home-screen app: sign in, hold the mic, speak a sentence → transcript appears (recorder engine), partner answers out loud, review appears under the turn, practice word shows.
  - Leave it 20 minutes, send a turn → it answers after the wake-up delay; opening a gate from an old turn shows the existing session message.
