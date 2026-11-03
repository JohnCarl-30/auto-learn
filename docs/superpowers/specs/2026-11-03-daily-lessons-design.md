# Daily lessons: a Duolingo-style path for speaking clearly

Date: 2026-11-03. Status: approved by John in chat on 2026-11-03.

## Why

John wants to get more articulate: to say what they mean clearly and in order,
in public speaking and in everyday talk, and to pick up better words along the
way. They want it to feel like Duolingo: something that hands them a short
lesson every day and that they come back to, not a tool they only open when
they already have a sentence to fix.

auto-learn already has the activities such a lesson would be built from (the
gate, word cards with pronunciation, the word bank, dictation, the `/talk`
speaking partner). What it lacks is everything that makes Duolingo a habit:

- It only reacts. Nothing happens until John pastes a sentence or starts a talk.
- It forgets across days. The recall drill is session-only by design
  (`apps/web/components/recall-drill.tsx` explains why: no due dates per word).
- There is no streak, XP, daily goal or level.
- There is no path. Every session starts from zero.

## What exists today (origin/main efd4ea4)

- Writing page (`/`): propose, gates, `/card`, bank, recall drill, say-it-back.
- `/talk` (`components/talk-panel.tsx`): scenario chat, push-to-talk, each learner
  turn reviewed by `ProposeService.propose(utterance, 'natural')`, a session
  practice word (`lib/session-word.ts`, `pickBankWord`).
- Speech in: Web Speech where available (`lib/speech-recognition.ts`), otherwise
  `/dictate` with `gpt-4o-mini-transcribe` (`OPENAI_TRANSCRIBE_MODEL`).
- Speech out: browser `speechSynthesis` (`use-partner-voice.ts`).
- Bank: localStorage signed out, Postgres `bank_entries` signed in
  (`db/schema.sql`, `lib/bank-store.ts`). `sourceSentence` is deliberately not
  synced (see the schema comment).
- Models: `PROPOSE_MODEL` / `CONVERSE_MODEL` = `gpt-5.6-luna`, `CARD_MODEL` =
  `gpt-5.6-terra` (`apps/api/src/llm/config.ts`).
- Deploy plan: `docs/deploy.md` "Free, for one person". Not finished; Neon,
  Resend, Render and Vercel env vars are still on John.

## The lesson

A lesson takes about five minutes and has three steps. John can take as many a day as they like:

1. **Review (about 1 minute).** Up to three bank words that are due today. Each
   is a fill-in-the-blank: John's own sentence with the word masked, the way the
   recall drill already does it (`maskLemma`), falling back to the definition for
   words with no sentence on this device. John types the word; it counts as
   right if it matches the lemma or one of the inflections `reuse.ts` already
   knows (`inflectionsOf`), case-insensitive. A wrong answer shows the word. Right
   pushes the word's next review further out; wrong brings it back sooner. If
   nothing is due, the step is skipped.
2. **New word (about 30 seconds).** One word John has not banked, suggested by
   the model for today's unit and checked against WordNet, shown as the existing
   word card (definition, pronunciation, say-it-back). Always new: practising
   banked words is step 1's job, so this step does not use `pickBankWord`.
3. **Speak (about 3 minutes).** A prompt from today's unit, e.g. "Explain your
   last project in 30 seconds." John answers out loud, and should try to use
   today's word. Feedback comes back after they finish, never during:
   - **Point first:** their first sentence, quoted back, and whether it states the
     main point.
   - **Structure:** whether the unit's shape is there (e.g. point, reason,
     example), each part quoted where found.
   - **Length and fillers:** how long they spoke against the unit's target, and
     how many filler words were heard ("um", "uh", "like", "you know",
     "basically", "parang", "ano").
   - **Today's word:** used, used correctly, or not used.
   - **One sentence, tighter:** the weakest sentence goes through the existing
     propose path, so any better word is behind the gate as everywhere else.
   John may try the same prompt once more after reading the feedback.

When the lesson is done: XP, the streak, and progress along the path.

## The path

Seven units, in order, each about one way of building an answer:

1. **Point first.** Say the main point in one sentence before anything else.
2. **Point, reason, example.**
3. **Say it shorter.** The same answer in 60 seconds, then in 20.
4. **Explain it simply.** Something John knows, to someone who doesn't.
5. **Tell a story.** Situation, what you did, what happened.
6. **Think on your feet.** An unexpected question, five seconds to prepare.
7. **Short talk.** Two minutes, with an opening line and a closing line.

## Goals

1. A daily lesson page with the three steps above, usable on John's iPhone
   (installed PWA) and laptop.
2. Spaced review of bank words that survives across days and devices.
3. Speaking feedback on structure, length, fillers and the day's word, with
   the one-sentence rewrite going through the gate.
4. Streak, XP and path progress, saved to John's account.

## Non-goals

- Other users, per-person limits, leaderboards, friends.
- Hearts/lives, gems, a shop, or anything that punishes a missed answer.
- Notifications or reminders (same call as Pocket Partner; maybe later).
- Pronunciation scoring beyond the existing say-it-back.
- Changing the writing page or `/talk`, except to share code with them.
- A model-generated curriculum. Units and prompts are written in code.

## Anti-goals (it fails even if it technically works when...)

John said nothing would make them quit; these are carried over from the
codebase's own rules and are my calls:

- The gate goes away. Better words in feedback stay hidden until the card opens.
- It interrupts or corrects mid-answer. Feedback comes after they finish.
- It blames John for the transcriber's miss. Filler counts and quotes are "what
  was heard", in the tone of `say-back.ts`.
- It costs money beyond the OpenAI usage John already agreed to for the app.
- It breaks the writing page, `/talk`, or the signed-out local bank.

## Constraints

- For John alone. The deployed API already requires sign-in for key-spending
  routes (`REQUIRE_SIGN_IN`); the new routes sit behind the same lock.
- Free hosting only (Vercel Hobby, Render free, Neon free). John's OpenAI key
  is approved for app use only, never for evals or as a CI secret.
- Keep the codebase's style: heavily commented, Zod contracts in
  `packages/shared`, tests split by filename (`.claude/skills/testing`), the
  schema file is the migration and stays idempotent.
- auto-learn is a time-boxed detour in John's career plan; keep to the goals
  above.

## Decided with John

- Duolingo-like: a daily lesson they are handed, with streaks and progress.
- Both speaking and new words, with articulation (clear, ordered speech) as the
  main event and vocabulary in support.
- Situations: public speaking and everyday articulating.
- Just for them for now; others maybe later.
- As many lessons a day as John wants. Every lesson earns XP and counts toward
  unlocking the next unit; the streak needs one lesson a day.

## My calls (John can override)

- **Built inside auto-learn**, as a new page `/learn`, rather than a new site.
  It reuses the bank, cards, gate, dictation and voice.
- **Lessons need an account.** The streak and review schedule live in Postgres
  so phone and laptop agree. Signed out, `/learn` asks John to sign in; the
  rest of the app keeps its signed-out path.
- **Review scheduling is a Leitner ladder:** intervals of 1, 3, 7, 14, 30 days.
  Right moves a word up a rung, wrong drops it to the first. New columns on
  `bank_entries` (`review_step`, `review_due_at`), added idempotently. Words
  banked before this ships start due today. Simple to reason about and test;
  swap for SM-2 later if it feels wrong.
- **The day is Asia/Manila.** A streak counts consecutive Manila calendar days
  with at least one completed lesson. Daily goal is one lesson.
- **XP is plain:** 10 for a completed lesson, +5 for using the day's word
  correctly, +5 for the retry. Nothing is taken away.
- **Units unlock in order** after five completed lessons in the previous one.
  Each unit ships with at least ten written prompts so a unit doesn't repeat
  within its five lessons.
- **Fillers are counted in code, not by the model**, from the transcript, in
  `packages/shared` so it is testable. Duration is measured on the client from
  record start to stop.
- **Structure feedback is one model call** (new `/lesson/feedback`, on
  `CONVERSE_MODEL`) given the unit, the prompt and the transcript, returning a
  Zod-validated verdict with quotes. The rewrite reuses
  `ProposeService.propose` on the sentence the model marks as weakest.
- **Today's word is always new** (see step 2). The suggestion request sends the
  banked lemmas to exclude, capped like `MAX_KNOWN_WORDS`. It joins the bank only
  after a correct use in step 3, keeping the bank's "earned" rule.
- **Review answers are typed**, matched against the lemma and its known
  inflections. Typing one word on a phone is fine, and a typed right answer is
  worth more than a self-marked one before pushing a word 30 days out.
- **Where things run:** Postgres and accounts live only in the Next.js app; the
  NestJS API has no database (`lib/sync.ts`). So the API stays stateless and
  owns the model calls (`/lesson/feedback`, the word suggestion), while the web
  app owns lesson completions, XP, streak and the review columns, written through
  its own server routes the way `lib/bank-store.ts` does.
- **Which unit:** a lesson is on the newest unlocked unit by default; earlier
  units can be replayed. After unit 7, lessons draw prompts from all units.
- **Typing is allowed** when no mic path works, and the lesson still counts.

## Left to the builder

- Screen layout and how the three steps flow on a phone.
- The exact prompt and Zod shape of the structure verdict, and the unit
  criteria text.
- Where lesson completions are stored (a `lesson_completions` table is the
  obvious shape: user, Manila date, unit, prompt id, XP).
- Writing the ten-plus prompts per unit.
- Tests for the new logic: Leitner stepping, the Manila streak across midnight
  and DST-free edge days, filler counting, unit unlocking, the gate on the
  rewrite.

## Open questions

- **Do the transcribers keep fillers?** Both Web Speech and
  `gpt-4o-mini-transcribe` tend to drop "um" and "uh". Check on a real
  recording early. If they are dropped, try the transcription `prompt`
  parameter with disfluent example text; if that fails, show only the fillers
  that are real words ("like", "basically") and say so.
- **Cost per lesson** is one transcription of up to two minutes, one feedback
  call, one propose call and sometimes a word suggestion, on `gpt-5.6-luna`.
  Not estimated here; measure it from the existing telemetry after a week.
- Nothing here can be used on the phone until the deploy in `docs/deploy.md`
  is finished.
