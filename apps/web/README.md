# web

The browser half. Next.js App Router, one page.

Start it from the repository root — `pnpm dev` there builds `packages/shared`
first, which this app imports as built output and cannot run without. Running
`next dev` in this directory alone will fail on that import, or worse, succeed
against a stale build.

`NEXT_PUBLIC_API_URL` is inlined at build time, not read at runtime. Pointing
this app at a different API means rebuilding it, not restarting it.

## Where the interesting parts are

|                                |                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/api.ts`                   | Every call to the API, including the NDJSON reader both streaming routes share. Responses are validated against the same schemas the server built them from, so a drifted contract fails loudly here instead of rendering blank. |
| `lib/use-review.ts`            | The whole review state machine: proposing, streaming previews, the open card, accept and reject.                                                                                                                                 |
| `lib/bank.ts`                  | IndexedDB, not localStorage — these are structured records that grow, and the schema deliberately mirrors the table they will sync to.                                                                                           |
| `components/sentence-view.tsx` | Where the gate marks are decided. Word-choice and register share one mark because both mean "a word waits here"; grammar gets its own because it means "a rule waits here".                                                      |
| `components/word-card.tsx`     | The artifact the product exists to deliver.                                                                                                                                                                                      |

## Tests

```bash
pnpm --filter web test      # jest + React Testing Library, jsdom
pnpm --filter web test:e2e  # Playwright, needs a built API
```

`*.test.tsx` is jest; `e2e/*.spec.ts` is Playwright and is excluded from it.
Playwright costs a browser and two servers per run, so a test that could live a
rung lower buys nothing but a slower way to learn the same thing. Reach for it
only when the assertion needs a real browser _and_ a real server — the strongest
one in there watches the wire and asserts that no gate carries its replacement.
