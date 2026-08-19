---
name: testing
description: How this monorepo splits jest, vitest and Playwright. Use when writing or moving a test, choosing a runner, adding an e2e check, or when a test cannot import `ai` / `@ai-sdk/openai`.
---

# Testing

Three runners, split by **filename**, not by package. The split is load-bearing: put a file
in the wrong one and it either fails to load or silently stops being checked.

| Pattern | Runner | Use it for |
|---|---|---|
| `*.spec.ts` | jest (`apps/api`) | Nest unit tests. ESM packages mocked at the boundary. |
| `*.test.ts` | vitest (`apps/api`, `packages/shared`) | Anything importing a real ESM package; all pure logic. |
| `apps/web/e2e/*.spec.ts` | Playwright | Browser checks against both servers. |

## The ESM constraint

`ai` and `@ai-sdk/openai` are ESM-only. **jest's CJS runtime cannot load them at all** — the
failure is `SyntaxError: Cannot use import statement outside a module`, pointing at the
import rather than at your test.

That single fact drives the whole split:

- A test that must touch the real SDK is a **`*.test.ts`** under vitest. `apps/api/src/llm/models.test.ts`
  is the worked example — it asserts `provider` contains `openai`, which only passes if the
  package genuinely loaded.
- A **`*.spec.ts`** mocks them, above the imports, because `jest.mock` hoists:

```ts
jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
```

Mocking `ai` is also how you drive a service's model output — cast `generateObject` to a
`jest.Mock` and set `mockResolvedValue({ object: … })`.

## A green jest run does not mean it compiles

`ts-jest` here does not run full type diagnostics. Jest has reported **25/25 passing on code
with three type errors in it**. Treat the two as independent gates and run both:

```
pnpm test        # all runners
pnpm typecheck   # the gate jest does not cover
```

If you changed a shared type, `pnpm typecheck` is the run that matters.

## Playwright

`playwright.config.ts` starts the API and the web app itself, so the only prerequisite is a
**built API** — the config runs `node ../api/dist/main.js`, which does not exist until
`nest build` has run.

Tests needing real model output are gated, not deleted:

```ts
test.skip(!process.env.OPENAI_API_KEY, 'needs OPENAI_API_KEY to get real proposals');
```

Everything deterministic — the sentence cap, validation, grammar notes — runs without a key,
so keep those ungated. Reach for Playwright when the assertion is about what crosses the
wire: the strongest test in the suite asserts the propose payload contains no `replacement`,
which is the product's central claim and cannot be checked from a unit test.

## Where logic goes to be testable

Pure functions over the wire contract belong in `packages/shared`, not in a component or a
service — `segment.ts`, `apply.ts` and `reuse.ts` all live there because they corrupt output
silently when wrong. If you are about to write offset arithmetic or string matching inside a
component, move it to `packages/shared` with a `*.test.ts` first.

Two invariants worth asserting whenever you touch that code: segments must **tile** the
sentence exactly (no gaps, no overlaps), and reuse matching must stay conservative — a false
positive congratulates someone for a word they never used.
