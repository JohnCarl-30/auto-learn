# Pocket partner: the speaking partner on your phone and desktop

Date: 2026-10-30. Status: approved by John on 2026-10-30.

## Why

John wants to grow their English vocabulary in spare moments: sitting around, or
already on their phone. They want to open something, talk to it out loud, have it
talk back, get corrected, and pick up new words while doing it. It should feel
like it lives on their phone and their laptop, not like a website they have to go find.

The `/talk` speaking partner (PR #41) already does most of the talking part. It
has never been used outside a dev machine, because dictation needs a paid
ElevenLabs key and nothing is deployed.

## What exists today (origin/main 84e22b7)

- `/talk` (`apps/web/components/talk-panel.tsx`): pick a scenario (office hours,
  seminar, group project, just talk), hear the partner's opener, answer by mic or
  keyboard. Every learner turn comes back reviewed under what was said, with the
  same gates as the writing page. Nothing is corrected out loud.
- Partner voice: browser `speechSynthesis` (`use-partner-voice.ts`). Free.
- Learner speech: `use-dictation.ts` records with `MediaRecorder` and posts audio
  to the API `/dictate`, which calls ElevenLabs. Needs `ELEVENLABS_API_KEY`.
- Word bank: localStorage when signed out (`lib/bank.ts`), Postgres when signed in
  (`lib/bank-store.ts`, `db/schema.sql`), with `times_reused` / `last_reused_at`.
- Sign-in: Auth.js magic links through Resend (`apps/web/auth.ts`).
- Deploy: web on Vercel, API on Render (`render.yaml`, `docs/deploy.md`). The
  blueprint uses paid `starter` plans and a Redis instance.

## Goals

1. **Talk from the phone and the laptop.** `/talk` works well on a phone screen
   and can be installed to the home screen / desktop (a PWA), so it opens like
   an app.
2. **Speech input on every device, free where possible.** Use the browser's
   built-in speech recognition (Web Speech API) where it works. Where it does
   not (the installed iPhone app), record with the existing `/dictate` path and
   transcribe with OpenAI. No ElevenLabs key needed.
3. **A new word each session.** When a session starts, the partner brings one
   word for the learner to try using during the chat. When the learner uses it
   correctly, that counts as a reuse in the bank.
4. **Online for free.** The app is reachable at an `https://` address (needed for
   microphone access on a phone) without a hosting bill. The only running cost is
   John's OpenAI key: gpt-4o-mini replies and reviews (estimated under $1/month)
   plus OpenAI transcription for phone speech (estimated $1–2/month at 20
   minutes a day; prices not rechecked).

## Non-goals

- ElevenLabs voices or transcription on the deployed site, and phone calls.
- A native iOS/Android app or an Electron desktop app. The PWA covers both.
- Always-listening or background listening. The learner presses to talk.
- Notifications or reminders.
- Serving other users. This is for John first; other students can come later.
- Redis, multiple API instances, or anything else the free tiers don't give.

## Anti-goals (it fails even if it technically works when...)

- It interrupts mid-sentence to correct. Corrections stay under the turn, after
  the learner finishes, as they do today.
- The gate goes away. Better words are still hidden until the learner opens the
  card. Do not show replacements inline to make it "faster".
- It costs money beyond the OpenAI usage John agreed to.
- It quietly breaks the existing writing page or the ElevenLabs path for anyone
  who does set the key.

## Constraints

- Free hosting only. OpenAI key (gpt-4o-mini) is approved for app use. It must
  never be used for evals or set as a CI secret.
- Microphone access on phones requires a secure context (`https://`).
- Keep the codebase's style: heavily commented, tests split by filename (see
  `.claude/skills/testing`), Zod contracts in `packages/shared`.
- auto-learn is on the paused list in John's career plan. They chose to do this
  anyway. Keep the scope to the four goals above.

## Decided with John

- Free first. Paid hosting and ElevenLabs are out.
- Replies, reviews and phone transcription use their OpenAI key.
- Push-to-talk chat, corrections after each turn, a new word to practise.
- PWA only (installed to the home screen / desktop). John's phone is an iPhone.
- Speech: free Web Speech where it works; OpenAI transcription where it does
  not. As of this writing, WebKit does not expose SpeechRecognition in
  home-screen web apps (https://bugs.webkit.org/show_bug.cgi?id=225298), while
  `MediaRecorder` does work there, so the installed iPhone app takes the OpenAI
  path.

## My calls (John can override)

- **Sign-in is required on the deployed API.** `/converse`, `/propose`, `/card`
  and `/dictate` have no auth today (only per-IP limits in
  `apps/api/src/common/rate-limit.ts`), so a public URL would let anyone spend
  John's OpenAI key. Put them behind `CallerGuard`. That makes Neon, Resend and
  `API_JWT_SECRET` required from day one, and John's sign-in address must be
  the Resend account owner's. The signed-out local-bank path keeps working in
  local dev; on the deployed site the learner signs in first. Also set a monthly
  spend cap on the OpenAI key as a backstop.

- **Speech recognition:** feature-detect `SpeechRecognition` /
  `webkitSpeechRecognition` and use it when present. Otherwise use `/dictate`,
  which gains an OpenAI transcription provider (e.g. `gpt-4o-mini-transcribe`)
  used when `OPENAI_API_KEY` is set and ElevenLabs is not. If a Web Speech
  attempt fails with `not-allowed` or `service-not-allowed`, fall back to
  `/dictate` for the rest of the session. If neither path is available, the mic
  hides and typing still works.
- **Hosting:** web on Vercel Hobby (free). API on Render's free web service,
  one instance, in-memory sessions, no Redis. A sleeping API means a 30–60 s
  first request after a break and lost open gates. That is acceptable for one
  user. Keep the paid blueprint for later, and add a free variant or document the
  changes rather than editing it away.
- **Database:** Neon free Postgres, same as Resumae, so the bank syncs between
  phone and laptop.
- **Sign-in mail:** Resend free tier. With no verified domain it only delivers to
  the Resend account owner's address. That is fine for John alone.
- **Where the session word comes from:** first a bank word that hasn't been
  reused recently (`last_reused_at`). If the bank is empty or every word is
  fresh, the model suggests one word that fits the chosen scenario at the
  learner's level, checked against the WordNet dictionary the API already has.
- **A suggested word joins the bank only after a correct use.** That keeps
  the bank's existing rule that words are earned (`reuse.ts`, `bank.ts`), so
  the entry gets its card at that point. An unused suggestion is practice only.
- **Reuse counting in `/talk` covers every banked word, as on the writing page.**
  Call `recordReuse` on each learner turn the way `use-review.ts` does. A
  session word that is also caught by `findReused` counts once.
- **Scenario:** "Just talk" becomes the default, so opening the app and pressing
  the mic is all it takes.

## Left to the builder

- How the session word is shown and how a correct use is detected (model
  judgement inside the existing review, or a lemma match on the transcript).
- PWA details: manifest, icons, a minimal service worker, standalone display.
- Mobile layout fixes on `/talk` (mic button reachable by thumb, no zoom on
  focus, the conversation scrolls).
- Which free Render settings to change, and whether a free blueprint is a second
  file or a documented diff.
- Tests for the new branches: speech-recognition fallback, the OpenAI
  transcription provider, word selection and the reuse counting.

## Open questions

- Test the installed app on John's iPhone early: mic permission prompt,
  recording, and the `/dictate` round trip on a sleeping Render API.
- Unverified as of this writing: that Render still offers a free web service tier
  and Neon a free Postgres tier. Check before deploying.
