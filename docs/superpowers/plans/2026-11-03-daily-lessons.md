# Daily Lessons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/learn` page that hands John a five-minute lesson (typed review of due bank words, one new word for the unit, a spoken answer with structure feedback) and tracks XP, a Manila-day streak and progress along seven units.

**Architecture:** Pure lesson logic and Zod contracts live in `packages/shared`. The NestJS API stays stateless and owns the model calls (`POST /lesson/word`, `POST /lesson/feedback`). The Next.js app owns all state in Postgres (review columns on `bank_entries`, a new `lesson_completions` table) behind its own route handlers, the way `/api/bank/sync` already does.

**Tech Stack:** pnpm monorepo; Next.js (App Router) + Auth.js + `pg`; NestJS + `ai` / `@ai-sdk/openai`; Zod; vitest, jest + RTL, supertest.

**Spec:** `docs/superpowers/specs/2026-11-03-daily-lessons-design.md`

## Global Constraints

- Match the house style: heavily commented (explain the why), Zod contracts in `packages/shared`, exported from `packages/shared/src/index.ts`.
- Tests split by filename per `.claude/skills/testing`: shared `*.test.ts` vitest; api `*.spec.ts` jest with `ai` mocked, api `*.test.ts` vitest; web `*.test.tsx` jest + RTL. Jest green is not a typecheck; run `typecheck` too.
- `apps/web/db/schema.sql` is the migration: every statement idempotent (`IF NOT EXISTS`).
- New API routes sit behind `SignedInGuard` with their own `RATE_LIMITS` entries.
- The gate stays: no replacement text reaches the client except through `/card`.
- Feedback is shown after the answer, never during. Filler counts and quotes are worded as what was *heard*.
- Day boundary is `Asia/Manila`. Review intervals: 1, 3, 7, 14, 30 days. XP: 10 per lesson, +5 for correct use of the day's word, +5 for the retry. Units unlock after 5 completed lessons in the previous unit. At least 10 prompts per unit.
- No new dependencies. Never put an OpenAI key in tests, evals or CI.
- Do not change behaviour of the writing page or `/talk`, apart from the shared recording option in Task 5 and nav links in Task 7.

## Review Focus

1. **"like" as a real verb.** "I like coffee" must not count as a filler; only comma-set "like" does. Test in Task 2.
2. **Streak across Manila midnight.** A lesson at 23:30 Manila and one at 00:30 Manila next day are two days even though both are the same UTC date; and a streak with no lesson yet today still shows yesterday's count. Tests in Task 1.
3. **Answer longer than three sentences.** Propose refuses more than `MAX_SENTENCES` (3); feedback must send at most two sentences to propose and still return the structure verdict. Test in Task 3.
4. **Words banked but never synced.** A word banked on this device before the lesson loads has no server row and would never be due. `useLesson` syncs first. Test in Task 6.
5. **Model names a weakest-sentence index that doesn't exist.** Out-of-range index must fall back to null rewrite, not throw. Test in Task 3.

---

### Task 1: Path and progress logic (shared)

**Files:**
- Create: `packages/shared/src/lesson-path.ts`
- Create: `packages/shared/src/lesson-path.test.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './lesson-path';`)

**Interfaces:**
- Produces:
  - `type UnitId = 1 | 2 | 3 | 4 | 5 | 6 | 7`, `UnitIdSchema = z.number().int().min(1).max(7)`
  - `interface LessonUnit { id: UnitId; title: string; goal: string; parts: string[]; targetSeconds: number; retryTargetSeconds?: number; prepSeconds?: number; prompts: { id: string; text: string }[] }`
  - `UNITS: readonly LessonUnit[]` (index 0 = unit 1)
  - `REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const`
  - `nextReview(step: number, right: boolean, now: Date): { step: number; dueAt: string }`
  - `manilaDate(at: Date): string` (`YYYY-MM-DD`)
  - `streakDays(completedDates: string[], today: string): number`
  - `lessonXp(flags: { wordCorrect: boolean; retried: boolean }): number`
  - `LESSONS_TO_UNLOCK = 5`
  - `highestUnlocked(counts: Partial<Record<UnitId, number>>): UnitId`
  - `pathFinished(counts: Partial<Record<UnitId, number>>): boolean` (unit 7 has ≥ 5)
  - `pickPrompt(unit: LessonUnit, recentPromptIds: string[]): { id: string; text: string }`

Unit content (titles, parts, timings fixed by the spec; write ≥ 10 prompts each, ids `u<unit>-<nn>`, e.g. `u1-01`):

| id | title | parts | targetSeconds | extra |
|---|---|---|---|---|
| 1 | Point first | `['point']` | 30 | |
| 2 | Point, reason, example | `['point','reason','example']` | 45 | |
| 3 | Say it shorter | `['point']` | 60 | `retryTargetSeconds: 20` |
| 4 | Explain it simply | `['what it is','why it matters','an everyday comparison']` | 60 | |
| 5 | Tell a story | `['situation','what you did','what happened']` | 60 | |
| 6 | Think on your feet | `['point','reason']` | 30 | `prepSeconds: 5` |
| 7 | Short talk | `['opening line','point','closing line']` | 120 | |

Prompts are about John's own life (projects, school, opinions, everyday things), never academic-essay topics.

- [ ] **Step 1: Write the failing tests** in `lesson-path.test.ts`:

```ts
describe('UNITS', () => {
  it('has seven units with at least ten unique prompts each', () => {
    expect(UNITS.map((u) => u.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const u of UNITS) {
      expect(u.prompts.length).toBeGreaterThanOrEqual(10);
      expect(new Set(u.prompts.map((p) => p.id)).size).toBe(u.prompts.length);
    }
  });
});

describe('nextReview', () => {
  const now = new Date('2026-11-03T00:00:00Z');
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();
  it('climbs one rung when right', () => {
    expect(nextReview(0, true, now)).toEqual({ step: 1, dueAt: days(1) });
    expect(nextReview(2, true, now)).toEqual({ step: 3, dueAt: days(7) });
  });
  it('stays on the top rung', () => {
    expect(nextReview(5, true, now)).toEqual({ step: 5, dueAt: days(30) });
  });
  it('drops to the start when wrong, due tomorrow', () => {
    expect(nextReview(4, false, now)).toEqual({ step: 0, dueAt: days(1) });
  });
});

describe('manilaDate', () => {
  it('uses the Manila calendar, not UTC', () => {
    expect(manilaDate(new Date('2026-11-03T15:30:00Z'))).toBe('2026-11-03'); // 23:30 Manila
    expect(manilaDate(new Date('2026-11-03T16:30:00Z'))).toBe('2026-11-04'); // 00:30 Manila
  });
});

describe('streakDays', () => {
  it('counts consecutive days ending today', () => {
    expect(streakDays(['2026-11-01', '2026-11-02', '2026-11-03'], '2026-11-03')).toBe(3);
  });
  it('keeps yesterday’s streak alive before today’s lesson', () => {
    expect(streakDays(['2026-11-01', '2026-11-02'], '2026-11-03')).toBe(2);
  });
  it('is zero after a missed day', () => {
    expect(streakDays(['2026-11-01'], '2026-11-03')).toBe(0);
  });
  it('ignores duplicates and order', () => {
    expect(streakDays(['2026-11-03', '2026-11-02', '2026-11-03'], '2026-11-03')).toBe(2);
  });
  it('crosses a month boundary', () => {
    expect(streakDays(['2026-10-31', '2026-11-01'], '2026-11-01')).toBe(2);
  });
});

describe('lessonXp', () => {
  it('is 10, +5 word, +5 retry', () => {
    expect(lessonXp({ wordCorrect: false, retried: false })).toBe(10);
    expect(lessonXp({ wordCorrect: true, retried: true })).toBe(20);
  });
});

describe('highestUnlocked / pathFinished', () => {
  it('starts at unit 1 and unlocks after five', () => {
    expect(highestUnlocked({})).toBe(1);
    expect(highestUnlocked({ 1: 4 })).toBe(1);
    expect(highestUnlocked({ 1: 5 })).toBe(2);
    expect(highestUnlocked({ 1: 9, 2: 5, 3: 1 })).toBe(3);
  });
  it('never passes 7', () => {
    const all = { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5 } as const;
    expect(highestUnlocked(all)).toBe(7);
    expect(pathFinished(all)).toBe(true);
    expect(pathFinished({ ...all, 7: 4 })).toBe(false);
  });
});

describe('pickPrompt', () => {
  it('prefers a prompt not done recently', () => {
    const unit = UNITS[0];
    const recent = unit.prompts.slice(0, -1).map((p) => p.id);
    expect(pickPrompt(unit, recent).id).toBe(unit.prompts.at(-1)!.id);
  });
  it('falls back to the least recently done when all are recent', () => {
    const unit = UNITS[0];
    const recent = unit.prompts.map((p) => p.id); // newest first
    expect(pickPrompt(unit, recent).id).toBe(recent.at(-1));
  });
});
```

- [ ] **Step 2: Run to verify failure**
Run: `pnpm --filter @auto-learn/shared test -- lesson-path`
Expected: FAIL, module `./lesson-path` not found.

- [ ] **Step 3: Implement `lesson-path.ts`** with the interfaces above. `manilaDate` uses `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })`. `streakDays` walks back one calendar day at a time from `today` (or from yesterday if `today` is absent), doing date arithmetic on `YYYY-MM-DD` at UTC noon to avoid offsets. `recentPromptIds` is newest first.

- [ ] **Step 4: Run to verify pass**
Run: `pnpm --filter @auto-learn/shared test -- lesson-path && pnpm --filter @auto-learn/shared typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/lesson-path.ts packages/shared/src/lesson-path.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): lesson path, review ladder, Manila streak and XP"
```

---

### Task 2: Answer helpers and API contracts (shared)

**Files:**
- Create: `packages/shared/src/lesson.ts`
- Create: `packages/shared/src/lesson.test.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './lesson';`)
- Modify: `packages/shared/src/dictate.ts` (`MAX_RECORDING_BYTES` → `2 * 1024 * 1024`, comment updated: covers a 120 s lesson answer at a worst-case bitrate)

**Interfaces:**
- Consumes: `UnitIdSchema` (Task 1), `inflectionsOf`, `MAX_KNOWN_WORDS`, `ProposeResponse`
- Produces:
  - `MAX_LESSON_RECORDING_SECONDS = 120`
  - `MAX_ANSWER_CHARS = 3000`
  - `FILLERS = ['um', 'uh', 'er', 'ah', 'you know', 'i mean', 'basically', 'parang', 'ano', 'like'] as const`
  - `countFillers(transcript: string): { total: number; byWord: Record<string, number> }`
  - `isRecallCorrect(answer: string, lemma: string): boolean`
  - `LessonWordRequest = z.object({ unit: UnitIdSchema, known: z.array(z.string()).max(MAX_KNOWN_WORDS) })`; response reuses `SessionWordResponse`
  - `LessonFeedbackRequest = z.object({ unit: UnitIdSchema, promptId: z.string(), answer: z.string().trim().min(1).max(MAX_ANSWER_CHARS), word: z.string().nullable(), known: z.array(z.string()).max(MAX_KNOWN_WORDS).optional() })`
  - `WordUse = z.enum(['correct', 'incorrect', 'unused'])`
  - `ModelLessonVerdict = z.object({ pointFirst: z.boolean(), pointFirstNote: z.string(), parts: z.array(z.object({ label: z.string(), quote: z.string().nullable() })), structureNote: z.string(), wordUse: WordUse, weakestSentence: z.number().int() })` (what the model returns; `weakestSentence` is a 0-based index into `splitSentences(answer)`)
  - `LessonFeedbackResponse = z.object({ firstSentence: z.string(), pointFirst: z.boolean(), pointFirstNote: z.string(), parts: …same…, structureNote: z.string(), wordUse: WordUse.nullable(), reviewedText: z.string().nullable(), review: ProposeResponse.nullable() })`. `reviewedText` is exactly the text sent to propose, so the client can `splitSentences` it to find sentence indexes for `/card` lookups, as `use-conversation.ts` does.

- [ ] **Step 1: Write the failing tests** in `lesson.test.ts`:

```ts
describe('countFillers', () => {
  it('counts spoken fillers, multi-word ones included', () => {
    expect(countFillers('Um, so, you know, I think uh it works')).toEqual({
      total: 3, byWord: { um: 1, 'you know': 1, uh: 1 },
    });
  });
  it('counts Taglish fillers', () => {
    expect(countFillers('Parang, ano, the build failed').total).toBe(2);
  });
  it('does not count "like" as a verb or preposition', () => {
    expect(countFillers('I like coffee, and it looks like rain').total).toBe(0);
  });
  it('counts comma-set "like"', () => {
    expect(countFillers('It was, like, huge. Like, really huge').byWord.like).toBe(2);
  });
  it('is zero for an empty transcript', () => {
    expect(countFillers('')).toEqual({ total: 0, byWord: {} });
  });
});

describe('isRecallCorrect', () => {
  it('accepts the lemma and its inflections, any case, trimmed', () => {
    expect(isRecallCorrect(' Argue ', 'argue')).toBe(true);
    expect(isRecallCorrect('argued', 'argue')).toBe(true);
  });
  it('rejects other words and empty answers', () => {
    expect(isRecallCorrect('agree', 'argue')).toBe(false);
    expect(isRecallCorrect('', 'argue')).toBe(false);
  });
});

describe('LessonFeedbackRequest', () => {
  it('rejects an answer over MAX_ANSWER_CHARS and a unit outside 1–7', () => {
    const base = { unit: 1, promptId: 'u1-01', answer: 'Hi.', word: null };
    expect(LessonFeedbackRequest.safeParse(base).success).toBe(true);
    expect(LessonFeedbackRequest.safeParse({ ...base, answer: 'a'.repeat(MAX_ANSWER_CHARS + 1) }).success).toBe(false);
    expect(LessonFeedbackRequest.safeParse({ ...base, unit: 8 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**
Run: `pnpm --filter @auto-learn/shared test -- lesson.test`
Expected: FAIL, module `./lesson` not found.

- [ ] **Step 3: Implement `lesson.ts`.** `countFillers`: lowercase, match multi-word fillers first, word boundaries (`\b`); `like` counts only when a comma directly precedes or follows it (`/(^|,)\s*like\s*,/` style), or it begins a sentence followed by a comma. Comment why: a transcriber's comma is the only signal separating filler "like" from the verb, and miscounting the verb blames the learner. `isRecallCorrect`: trimmed lowercase answer equals the lemma or one of `inflectionsOf(lemma)`.

- [ ] **Step 4: Run to verify pass**
Run: `pnpm --filter @auto-learn/shared test && pnpm --filter @auto-learn/shared typecheck`
Expected: PASS (whole shared suite, since `dictate.ts` changed).

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/lesson.ts packages/shared/src/lesson.test.ts packages/shared/src/index.ts packages/shared/src/dictate.ts
git commit -m "feat(shared): filler count, recall check and lesson contracts"
```

---

### Task 3: API lesson module (`/lesson/word`, `/lesson/feedback`)

**Files:**
- Create: `apps/api/src/lesson/lesson.module.ts`, `lesson.controller.ts`, `lesson.service.ts`, `lesson.service.spec.ts`
- Modify: `apps/api/src/converse/converse.service.ts` (extract word checking), `apps/api/src/converse/converse.module.ts` (`exports: [ConverseService]`)
- Modify: `apps/api/src/llm/prompts.ts` (add `LESSON_WORD_SYSTEM_PROMPT`, `lessonWordUserPrompt(input: { unit: LessonUnit; known: string[] }): string`, `LESSON_FEEDBACK_SYSTEM_PROMPT`, `lessonFeedbackUserPrompt(input: { unit: LessonUnit; prompt: string; sentences: string[]; word: string | null }): string`)
- Modify: `apps/api/src/llm/config.ts` (`LESSON_FEEDBACK_MAX_OUTPUT_TOKENS = 600`)
- Modify: `apps/api/src/common/rate-limit.ts` (`lesson: { ttl: minutes(1), limit: 10 }`, `lessonWord: { ttl: minutes(1), limit: 5 }`, each with a one-line why)
- Modify: `apps/api/src/app.module.ts` (import `LessonModule`)
- Modify: `apps/api/src/app.http.spec.ts` (routes exist, guarded, Zod-validated)

**Interfaces:**
- Consumes: `LessonWordRequest`, `LessonFeedbackRequest`, `LessonFeedbackResponse`, `ModelLessonVerdict`, `UNITS`, `splitSentences`, `MAX_SENTENCES`, `ProposeService.propose`
- Produces:
  - `ConverseService.suggestCheckedWord(system: string, prompt: string, known: string[]): Promise<SessionWordResponse>`: the body of today's `suggestWord` after the prompt is built (one-word parse, known filter, WordNet lookup, null on any failure). `suggestWord` calls it unchanged in behaviour.
  - `LessonService.suggestWord(req: LessonWordRequest): Promise<SessionWordResponse>`
  - `LessonService.feedback(req: LessonFeedbackRequest): Promise<LessonFeedbackResponse>`
  - HTTP: `POST /lesson/word`, `POST /lesson/feedback`, both `@HttpCode(200)`, `SignedInGuard`, throttled.

Feedback flow:
1. `sentences = splitSentences(answer)`; find the unit and prompt text (`400` via Zod is fine for unknown unit; unknown `promptId` → `400 invalid_prompt`).
2. `generateObject({ model: converseModel(), schema: ModelLessonVerdict, … maxOutputTokens: LESSON_FEEDBACK_MAX_OUTPUT_TOKENS, maxRetries: MODEL_MAX_RETRIES_VOICE, abortSignal: AbortSignal.timeout(CONVERSE_TIMEOUT_MS) })`, then `telemetry.spend`. Model failure → `502 upstream_failed`, the same shape `ProposeService.fail` uses.
3. Rewrite targets: the weakest sentence (if the index is in range) plus the first sentence containing `findUsedForm(sentence, word)` if different. At most 2, deduped, in answer order. Joined with a space → `reviewedText`; `ProposeService.propose({ text: reviewedText, option: 'natural', known })`. Propose failure → `review: null` and `reviewedText: null`; the verdict still goes out.
4. `wordUse` is `null` when `word` is null.

The feedback system prompt says: judge only structure and the word, quote the learner's exact words, never rewrite, be kind, and treat the transcript as possibly imperfect speech-to-text.

- [ ] **Step 1: Write the failing tests** in `lesson.service.spec.ts` (mock `ai` and `@ai-sdk/openai` above imports; stub `ProposeService.propose`, `TelemetryService.spend`, `ConverseService.suggestCheckedWord`):
  - `feedback returns the verdict with the first sentence quoted`: verdict `{ pointFirst: true, …, weakestSentence: 1 }`, answer `"I build bots. They help shops. Like a store clerk."` → `firstSentence === 'I build bots.'`, `propose` called once with `text: 'They help shops.'`.
  - `sends the weakest sentence and the word sentence, at most two`: answer of 5 sentences, word in sentence 4, weakest 1 → `propose` text is sentence 1 + ' ' + sentence 4, and `reviewedText` equals it.
  - `out-of-range weakest index skips the rewrite`: `weakestSentence: 9`, `word: null` → `propose` not called, `review === null`, `reviewedText === null`, verdict fields present.
  - `propose failure keeps the verdict`: `propose` rejects → `review === null`, `pointFirst` still returned.
  - `model failure is a 502`: `generateObject` rejects → throws `HttpException` with status 502.
  - `wordUse is null without a word`.
  - `suggestWord passes the unit prompt to suggestCheckedWord`: called with `LESSON_WORD_SYSTEM_PROMPT` and a prompt containing the unit title.
  In `app.http.spec.ts`: `POST /lesson/feedback` with `unit: 9` → 400; with `REQUIRE_SIGN_IN` on and no token → 401, following the existing `/converse` cases.

- [ ] **Step 2: Run to verify failure**
Run: `pnpm --filter api test:jest -- lesson app.http`
Expected: FAIL, cannot find `./lesson.service`.

- [ ] **Step 3: Implement** the extraction in `ConverseService`, then `LessonService`, controller, module, prompts, config, rate limits and `AppModule` wiring as listed above.

- [ ] **Step 4: Run to verify pass**
Run: `pnpm --filter api test && pnpm --filter api typecheck && pnpm --filter api lint`
Expected: all PASS, including the existing converse specs (behaviour unchanged).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src
git commit -m "feat(api): lesson word and spoken-answer feedback"
```

---

### Task 4: Lesson state in Postgres and web routes

**Files:**
- Modify: `apps/web/db/schema.sql`
- Create: `apps/web/lib/lesson-store.ts` (`import 'server-only'`)
- Create: `apps/web/app/api/lesson/progress/route.ts` (GET), `apps/web/app/api/lesson/complete/route.ts` (POST), `apps/web/app/api/lesson/review/route.ts` (POST)
- Modify: `packages/shared/src/lesson.ts` (add the three web contracts below) and `lesson.test.ts`

**Interfaces:**
- Consumes: `currentUser` (`lib/dal.ts`), `pool` (`lib/db.ts`), `nextReview`, `manilaDate`, `streakDays`, `lessonXp`, `highestUnlocked`, `pathFinished`, `UnitIdSchema`
- Produces (shared contracts):
  - `LessonProgress = z.object({ xp: z.number().int(), streak: z.number().int(), doneToday: z.number().int(), counts: z.record(z.string(), z.number().int()), highestUnlocked: UnitIdSchema, pathFinished: z.boolean(), recentPromptIds: z.array(z.string()).max(20), dueEntryIds: z.array(z.string()).max(3) })`
  - `LessonCompleteRequest = z.object({ unit: UnitIdSchema, promptId: z.string().min(1), wordCorrect: z.boolean(), retried: z.boolean() })` → responds `LessonProgress`
  - `ReviewAnswerRequest = z.object({ entryId: z.string().min(1), right: z.boolean() })` → `{ ok: true }`
- Produces (store, all take `userId: string`):
  - `readProgress(userId, now: Date): Promise<LessonProgress>`
  - `recordCompletion(userId, input: LessonCompleteRequest, now: Date): Promise<void>` (XP computed here with `lessonXp`, never taken from the client)
  - `recordReview(userId, entryId: string, right: boolean, now: Date): Promise<boolean>` (false if no such row)

Schema additions (append, idempotent, commented in the file's style):

```sql
ALTER TABLE bank_entries ADD COLUMN IF NOT EXISTS review_step   integer NOT NULL DEFAULT 0;
-- Null means never reviewed, which counts as due now.
ALTER TABLE bank_entries ADD COLUMN IF NOT EXISTS review_due_at timestamptz;

CREATE TABLE IF NOT EXISTS lesson_completions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  manila_date  date NOT NULL,
  unit         integer NOT NULL CHECK (unit BETWEEN 1 AND 7),
  prompt_id    text NOT NULL,
  xp           integer NOT NULL
);
CREATE INDEX IF NOT EXISTS lesson_completions_user_date_idx
  ON lesson_completions (user_id, manila_date);
```

`writeBank`'s `on conflict … do update set` does not list the review columns, so a sync never resets a schedule. Add a one-line comment there saying so. Due entries: `review_due_at IS NULL OR review_due_at <= now`, ordered by `review_due_at NULLS FIRST, added_at`, limit 3.

Routes follow `app/api/bank/sync/route.ts` exactly: `401 not_signed_in`, `400` on bad JSON or Zod failure, `503` with `console.error` on a database error, `Cache-Control: no-store`. `review` returns `404 no_such_word` when `recordReview` is false.

- [ ] **Step 1: Write the failing tests** in `lesson.test.ts`: `LessonCompleteRequest` rejects `unit: 0`; `ReviewAnswerRequest` rejects an empty `entryId`; `LessonProgress` parses a full sample and rejects 4 `dueEntryIds`.
- [ ] **Step 2: Run to verify failure**: `pnpm --filter @auto-learn/shared test -- lesson.test`. Expected: FAIL on missing exports.
- [ ] **Step 3: Implement** the contracts, schema, store and three routes.
- [ ] **Step 4: Verify**: `pnpm --filter @auto-learn/shared test && pnpm --filter web typecheck && pnpm --filter web lint`. Then apply the schema twice against a local Postgres (`psql "$DATABASE_URL" -f apps/web/db/schema.sql` run two times). Expected: both runs succeed with no errors. If no local Postgres is configured, say so in the task report rather than skipping silently.
- [ ] **Step 5: Commit**
```bash
git add apps/web/db/schema.sql apps/web/lib/lesson-store.ts apps/web/lib/bank-store.ts apps/web/app/api/lesson packages/shared/src/lesson.ts packages/shared/src/lesson.test.ts
git commit -m "feat(web): lesson progress, completions and review schedule in Postgres"
```

---

### Task 5: Longer recordings for lessons

**Files:**
- Modify: `apps/web/lib/use-dictation.ts`
- Modify: `apps/web/lib/use-dictation.test.tsx`

**Interfaces:**
- Produces: `useDictation(onTranscript: (t: string) => void, options?: { maxSeconds?: number })`. Default stays `MAX_RECORDING_SECONDS` (60), so `/talk` and the writing page are unchanged. Lessons pass `MAX_LESSON_RECORDING_SECONDS` (120).

- [ ] **Step 1: Write the failing test**: with fake timers, `useDictation(cb, { maxSeconds: 120 })` is still recording at 61 s and has stopped by 120 s. A second case with no options stops at 60 s (existing behaviour pinned).
- [ ] **Step 2: Run**: `pnpm --filter web test -- use-dictation`. Expected: the 120 s case FAILS.
- [ ] **Step 3: Implement**: replace the constant at the stop timer (`use-dictation.ts:189`) with `(options?.maxSeconds ?? MAX_RECORDING_SECONDS) * 1000`.
- [ ] **Step 4: Run**: `pnpm --filter web test -- use-dictation && pnpm --filter web typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -am "feat(web): dictation takes a longer limit for lesson answers"`

---

### Task 6: Lesson client and `useLesson`

**Files:**
- Modify: `apps/web/lib/api.ts` (add `lessonWord(body: LessonWordRequest): Promise<SessionWordResponse>` → `post('/lesson/word', …)`, `lessonFeedback(body: LessonFeedbackRequest): Promise<LessonFeedbackResponse>` → `post('/lesson/feedback', …)`)
- Create: `apps/web/lib/lesson-client.ts` (`fetchProgress(): Promise<LessonProgress>`, `completeLesson(body: LessonCompleteRequest): Promise<LessonProgress>`, `answerReview(body: ReviewAnswerRequest): Promise<void>`, calling the Task 4 routes with `fetch` the way `lib/sync.ts` does)
- Create: `apps/web/lib/use-lesson.ts`, `apps/web/lib/use-lesson.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 2, 4 contracts; `syncBank`, `listBank`, `knownWords`, `bankWord`, `maskLemma`, `findUsedForm`, `splitSentences`, `fetchCard`, `countFillers`, `isRecallCorrect`, `pickPrompt`, `UNITS`
- Produces:

```ts
export type LessonStep = 'loading' | 'review' | 'word' | 'speak' | 'feedback' | 'done' | 'error';
export interface ReviewItem { entryId: string; lemma: string; cue: string; cueIsDefinition: boolean }
export interface SpokenResult {
  answer: string; seconds: number | null; fillers: ReturnType<typeof countFillers>;
  feedback: LessonFeedbackResponse;
}
export function useLesson(unitId?: UnitId): {
  step: LessonStep;
  progress: LessonProgress | null;
  unit: LessonUnit | null;
  prompt: { id: string; text: string } | null;
  reviews: ReviewItem[]; reviewIndex: number;
  answerReview(answer: string): Promise<boolean>;  // true if right; advances after the caller shows the result
  advanceReview(): void;
  word: SessionWord | null;                        // null: the word step is skipped
  continueToSpeak(): void;
  submitAnswer(answer: string, seconds: number | null): Promise<void>;
  attempts: SpokenResult[];                        // 1 or 2
  canRetry: boolean;                               // true after the first attempt only
  retry(): void;
  finish(): Promise<void>;
  bankedWord: boolean;                             // today's word joined the bank
  error: string | null;
};
```

Behaviour:
- On mount: `await syncBank()` (errors ignored, as elsewhere), then `fetchProgress()`. The unit is `unitId` if given and ≤ `highestUnlocked`; else, if `pathFinished`, a random unit; else `highestUnlocked`. Prompt from `pickPrompt(unit, recentPromptIds)`. Reviews: map `dueEntryIds` to local entries from `listBank()`. Cue is `maskLemma(sourceSentence, lemma)` when the sentence is non-empty and the mask changed it, else the definition with `cueIsDefinition: true`. Ids with no local entry are dropped. Then request `lessonWord({ unit, known: await knownWords() })` in parallel.
- Steps go review (skipped when none) → word (skipped when `word` is null) → speak → feedback → done.
- `submitAnswer` calls `lessonFeedback`. If `wordUse === 'correct'` and `review` is present, find the sentence index in `splitSentences(reviewedText)` with `findUsedForm`, then `fetchCard({ kind: 'lookup', … })` and `bankWord(card, answer, 'accepted')`, as `use-conversation.ts` does, and set `bankedWord`. A failure here stays silent.
- `finish` posts `completeLesson({ unit, promptId, wordCorrect: any attempt had wordUse 'correct', retried: attempts.length === 2 })` and stores the returned progress.

- [ ] **Step 1: Write the failing tests** in `use-lesson.test.tsx` (jest + RTL `renderHook`; mock `@/lib/api`, `@/lib/lesson-client`, `@/lib/bank`, `@/lib/sync`):
  - `syncs before reading progress`: `syncBank` resolves before `fetchProgress` is called (call order).
  - `starts at review when words are due, with the masked sentence as cue`: bank entry `{ id: 'argue:1', lemma: 'argue', sourceSentence: 'We argue a lot.' }`, due `['argue:1']` → `step === 'review'`, `reviews[0].cue === 'We _____ a lot.'`.
  - `falls back to the definition when the sentence is empty`.
  - `skips review when nothing is due and word when none is suggested`: `step === 'speak'`.
  - `uses a random unit after the path is finished`: `pathFinished: true` and a stubbed `Math.random` → that unit.
  - `banks the word after a correct use`: `wordUse: 'correct'`, `reviewedText: 'We should argue less.'` → `fetchCard` called with `sentenceIndex: 0, word: 'argue'`, `bankWord` called, `bankedWord === true`.
  - `finish reports retried and wordCorrect`: two attempts, second `wordUse: 'correct'` → `completeLesson` called with `{ wordCorrect: true, retried: true }`.
- [ ] **Step 2: Run**: `pnpm --filter web test -- use-lesson`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `api.ts` additions, `lesson-client.ts`, `use-lesson.ts`.
- [ ] **Step 4: Run**: `pnpm --filter web test -- use-lesson && pnpm --filter web typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/lib/api.ts apps/web/lib/lesson-client.ts apps/web/lib/use-lesson.ts apps/web/lib/use-lesson.test.tsx
git commit -m "feat(web): useLesson drives review, word, speak and finish"
```

---

### Task 7: `/learn` page and lesson UI

**Files:**
- Create: `apps/web/app/learn/page.tsx`
- Create: `apps/web/components/lesson-panel.tsx` (+ `lesson-panel.test.tsx`), `review-step.tsx`, `speak-step.tsx`, `lesson-feedback.tsx` (+ `lesson-feedback.test.tsx`), `lesson-path.tsx`
- Modify: `apps/web/app/talk/page.tsx` and `apps/web/app/page.tsx` (header link "Learn"), `apps/web/app/manifest.ts` (`start_url: '/learn'`)

**Interfaces:**
- Consumes: `useLesson` (Task 6), `useDictation(cb, { maxSeconds: MAX_LESSON_RECORDING_SECONDS })` (Task 5), `PronounceButton`, `SayItBack`, `currentUser`, `AccountMenu`, `ThemeToggle`, `components/ui/*`
- Produces: `LessonPanel()`; `LessonFeedback({ unit, attempt, retryTarget }: { unit: LessonUnit; attempt: SpokenResult; retryTarget: boolean })`; `LessonPath({ progress }: { progress: LessonProgress })`

Page: server component in the layout of `app/talk/page.tsx` (title "Learn · auto-learn"). Signed out (`currentUser()` null) shows one line and a link to `/signin`; signed in renders `<LessonPanel />`.

UI (layout is the builder's; content is fixed):
- **Review step:** cue, one text input (`autoCapitalize="none"`, font size ≥ 16px so iOS does not zoom), Check. Shows "Right" or the word, then Next.
- **Word step:** word, definition, `PronounceButton`, `SayItBack`, a line "Try to use it in your answer", Continue.
- **Speak step:** unit title, prompt, target seconds. For unit 6, the prompt is hidden until Start; a 5 s countdown then recording starts. Mic button with an elapsed timer; seconds measured from record start to stop. A transcript box editable before Submit, as on `/talk`. Typing is allowed when the mic is unavailable (`seconds: null`).
- **Feedback:** "Your first sentence: '…'" plus `pointFirstNote`; each part with its quote or "Not heard"; "You spoke for 0:42 (target 0:45)" (omitted when `seconds` is null); "Fillers heard: 3 (um ×2, like ×1)"; word use; the rewritten sentence rendered through the same gated sentence view `/talk` uses for its review (`SentenceView` + card open), so better words stay behind the gate. For unit 3, the retry button says "Now say it in 20 seconds".
- **Done:** XP earned this lesson, streak ("3-day streak"), `LessonPath` (seven units, done/total of 5, locked ones dimmed, tap an unlocked one to start a lesson there), and "Another lesson".

- [ ] **Step 1: Write the failing tests:**
  - `lesson-feedback.test.tsx`: renders the quoted first sentence; renders "Not heard" for a part with `quote: null`; hides the duration line when `seconds` is null; shows "Fillers heard: 0" with no breakdown when none; the unit 3 first attempt shows "Now say it in 20 seconds".
  - `lesson-panel.test.tsx` (mock `useLesson`): `step: 'review'` renders the cue and a Check button; `step: 'done'` renders "+20 XP" and "3-day streak" for those values; locked units have `aria-disabled="true"`.
- [ ] **Step 2: Run**: `pnpm --filter web test -- lesson-`. Expected: FAIL (components missing).
- [ ] **Step 3: Implement** the page, components, nav links and manifest change.
- [ ] **Step 4: Run**: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint`. Expected: all PASS (whole web suite, since `talk/page.tsx` and `page.tsx` changed).
- [ ] **Step 5: Commit**
```bash
git add apps/web/app apps/web/components
git commit -m "feat(web): /learn daily lesson page"
```

---

### Task 8: Whole-repo check and docs

**Files:**
- Modify: `README.md` (a short "Daily lessons" section: what a lesson is, that it needs sign-in and Postgres, the new schema needs re-running `schema.sql` on deploy)
- Modify: `docs/deploy.md` (re-run `schema.sql` after this change)

- [ ] **Step 1: Run everything**: `pnpm -r test && pnpm -r typecheck && pnpm -r lint`. Expected: all PASS.
- [ ] **Step 2: Manual check in a browser** (`pnpm dev`, signed in, local Postgres, an `OPENAI_API_KEY` for app use only): one full lesson. Review answer right and wrong, word step, a spoken answer, feedback, retry, finish. Confirm the streak shows 1 and XP is 10–20. Record whether `um`/`uh` survived transcription (the spec's open question) in the task report. If no key or database is available locally, say so and list what was not exercised.
- [ ] **Step 3: Commit**: `git commit -am "docs: daily lessons in README and deploy notes"`
