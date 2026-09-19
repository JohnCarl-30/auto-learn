# api

The server half. NestJS, deliberately not serverless: it holds a session
between `/propose` writing a proposal and `/card` opening one of its gates, it
streams both of those routes for seconds at a time, and it reads a 36MB WordNet
database off local disk.

Start it from the repository root with `pnpm dev`, which builds
`packages/shared` first. `OPENAI_API_KEY` is the only variable it needs; it
says at boot which of the others are missing and what refuses without them.

## Modules

|               |                                                                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `propose/`    | One model call per submission. Locates every edit by searching for its text — models are unreliable at character offsets, and a wrong one silently corrupts the sentence — and drops any it cannot find rather than guessing. |
| `card/`       | The second model call, grounded in senses the dictionary supplied. A sense the model invented is refused rather than shown.                                                                                                   |
| `dictionary/` | WordNet, on disk. Pronunciation comes from a web API, because it can be missing without costing the reader the card — the network sits where its failure is cosmetic.                                                         |
| `session/`    | In memory, or Redis when `REDIS_URL` is set. This is where the withheld wordings live between the two calls.                                                                                                                  |
| `llm/`        | Prompts, model ids, prices, provider options. Split so `evals/` can import the data without loading an ESM-only provider package.                                                                                             |
| `telemetry/`  | In-memory counters. The numbers that decide what v2 is.                                                                                                                                                                       |

## Tests

```bash
pnpm --filter api test   # both runners
```

Two of them, split by filename, and the split is load-bearing:

- `*.spec.ts` → **jest**, with `ai` and the provider packages mocked at the
  module boundary.
- `*.test.ts` → **vitest**, for anything that must touch the real SDK.

`ai`, `@ai-sdk/openai` and `@ai-sdk/elevenlabs` are ESM-only, and jest's
CommonJS runtime cannot load them at all — the failure points at the import
rather than at your test. One unmocked ESM import fails a whole file at parse
time, so a spec that touches `llm/models` must mock all three even if it only
cares about one.

A green jest run is not evidence that the code compiles: `ts-jest` does not run
full type diagnostics here, and has reported everything passing on code
carrying three type errors. `pnpm typecheck` is the gate it does not cover.
