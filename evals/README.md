# Evals

The two model calls in this product are `/propose` and `/card`. Nothing in the
test suite tells you whether either one is any *good* — jest and vitest mock the
model out, which is correct for testing wiring and useless for testing output.
So a prompt edit ships on a hunch, and the way you find out it was worse is a
learner reading a definition of "novel" that is about books.

This harness is the missing gate. It runs real cases through the real prompts
against a real model, scores the output, and compares the scores to a committed
baseline.

```
pnpm eval                     # both suites, judged, against the baseline
pnpm eval propose             # one suite
pnpm eval card --no-judge     # deterministic scorers only — no judge calls
pnpm eval --filter=novel      # cases whose id contains "novel"
pnpm eval --repeat=3          # three runs per case; the spread is the flakiness
pnpm eval --list              # cases and scorers, calls nothing, spends nothing
pnpm eval --update-baseline   # run again, then record it as the new normal
pnpm eval --update-baseline --from-last   # record the run already on disk, calling nothing
```

`OPENAI_API_KEY` comes from `apps/api/.env` if it is not already in the
environment — the same key, not a second copy to keep in sync.

## It scores production, not a copy of production

`src/suites/*.ts` import `PROPOSE_SYSTEM_PROMPT`, `proposeUserPrompt`,
`PROPOSE_MODEL`, `proposeProviderOptions` and `PROPOSE_MAX_OUTPUT_TOKENS`
directly from `apps/api/src/llm/`. Nothing about the call is restated here.

That is the whole reason those constants moved out of the services in the first
place. A harness holding its own copy of the prompt goes green while the
shipped prompt rots, which is worse than having no harness: it produces a
number people trust.

The one thing it does not import is the provider instance. `@ai-sdk/openai` is
ESM-only and `apps/api` is CommonJS, so `llm/config.ts` holds the data and
`llm/models.ts` holds the `openai()` calls — the same split that forces jest and
vitest apart in `.claude/skills/testing`.

## What is scored

Two kinds of scorer, and the split matters.

**Deterministic scorers** (`src/scorers/`) are pure functions over the model's
output. They are free, they never flake, and they have their own unit tests
under `pnpm test` — a scorer that is wrong is worse than no eval, because it
reports a number nobody re-derives. They encode rules the prompt already
states:

| Scorer | A failure means |
| --- | --- |
| `verbatim-spans` | The model paraphrased the text it quotes. Production locates spans by searching for `original`, so these edits are **silently dropped** and the user just sees fewer suggestions. |
| `expected-fixes` | The fix the case exists to demand is missing, or arrived at the wrong tier — a typo behind a card, or a weak word applied silently. |
| `no-false-positives` | A correct sentence was "corrected". The expensive failure: it teaches a false rule and costs the reader their trust in the real ones. |
| `transform-discipline` | A grammar-only request came back with the vocabulary restyled. The button is a promise about scope. |
| `no-deletion` | An edit replaced the writer's words with nothing. |
| `span-minimality` | One edit swallowed the sentence, leaving nothing teachable for the card. |
| `mechanical-not-gated` | A gate was spent on a change that alters no letters, and a non-word went to the word bank. |
| `sense-grounded` | The card cited a `senseId` the dictionary never supplied. In production this is a 502. |
| `definition-rewritten` | The archaic dictionary string was passed through — "substantial" as "Corporeal; material; firm." |
| `right-sense-for-context` | The card defines a real sense of a real word, and the wrong one. |
| `nuance-is-substantive` | A synonym came with "similar meaning", which is the one thing a dictionary would already have told the learner. |
| `synonyms-are-distinct` | The headword was listed as its own synonym. |
| `examples-are-fresh` | An example echoed the writer's own sentence, or never used the word. |
| `pos-matches-sense`, `register-label`, `part-of-speech` | The label disagrees with the sense the card itself selected, or with what the case expects. |

A scorer that does not apply to a case returns nothing and is left out of the
denominator. `no-false-positives` reads `3/3`, not `14/14` — otherwise a dataset
could raise its own pass rate just by growing.

**Judged scorers** cover what no assertion can reach: is the definition *true*,
is the sense the one this sentence carries, is the nuance line a real
distinction. The verdicts are booleans rather than 1–5 ratings, because ratings
drift with the prompt around them and there is nothing to do with a 3.5. The
rubric tells the judge to mark FALSE when unsure — a judge that agrees with
everything reports 100% forever and detects nothing.

Run `--no-judge` while iterating; it is much cheaper and catches most breakage.

## Adding a case

Propose cases live in `datasets/propose.ts`, card cases in `datasets/card.ts`.
Both require a `why`. A dataset accumulates cases faster than anyone remembers
what they were for, and a case nobody can justify is the first one to get
"fixed" by loosening the expectation it was written to hold.

Cases that expect *nothing* — `clean: true` — are as load-bearing as the ones
that expect a fix. A dataset made only of broken sentences cannot see
over-correction, which is the failure mode that loses a learner.

A new card word needs a dictionary entry:

```
pnpm --filter @auto-learn/evals record-dictionary
```

That hits the same two endpoints `DictionaryService` uses and commits the
result to `datasets/dictionary.json`. Recorded rather than live because a score
that moves when Wiktionary is edited is a score that moves for a reason nobody
changed — and because the fixture is what makes a wrong-sense failure
reproducible.

Check the entry before writing the case around it. `address` has no "deal with
a problem" sense at all, which is why that case is about addressing a
committee: the original sentence would have failed on a dictionary gap rather
than on anything the model did.

## The baseline

`results/baseline.json` holds the pass rate and mean per scorer, per suite. A
run compares against it and exits non-zero when a pass rate drops more than
`--tolerance` (default 0.05) below the recorded one. With no baseline it reports
and exits 0.

Individual runs land in `results/runs/` with every model output, and are
gitignored — the baseline is the artifact, the runs are working notes.

When a change moves the numbers on purpose, record them and commit the new file
**with the change that moved it**. `--update-baseline` re-runs first, which is
what CI wants; add `--from-last` to record the run you have just finished
reading, so agreeing with a number does not cost a second run to write it down. A baseline updated in its own commit
is a baseline nobody can review.

## Checking the judge

A judged score is a measurement, and an unvalidated measurement is a number
with no error bar. When `judge-synonym-nuance` sits at 67%, the harness cannot
tell you whether the card call lists bad synonyms or the rubric is too strict.
Only a human can.

```
pnpm --filter @auto-learn/evals validate-judge            # build labels/synonyms.json
# set "human" to "ok" or "bad" on each item
pnpm --filter @auto-learn/evals validate-judge --report   # agreement, kappa, disagreements
```

It reports Cohen's kappa rather than raw agreement alone, because raw agreement
flatters a judge that accepts everything: if 90% of synonyms are genuinely
fine, a judge that never objects agrees 90% of the time while carrying no
information. Kappa subtracts what the two raters' base rates would have agreed
on by chance.

The split between `too strict` and `too loose` is what tells you which side to
fix — one-directional error is a rubric mis-aimed, scattered error is a rubric
that is vague. Labels survive re-extraction, so labelling accumulates instead of
restarting after every run.

## What this does not tell you

- **It is stochastic, and the judged scorers are noisier than they look.**
  `judge-synonym-nuance` came back 87% and 67% on two consecutive runs of the
  same prompt at n=30. A card fails that scorer if *any* one of its two or
  three synonyms is faulted, so a single per-item disagreement swings the card,
  and ten cards is not many cards. Read `mean` beside `passRate` there — it
  moves less — and do not gate on a 5-point change at that sample size. The
  fix is more samples or more human labels, not a tighter prompt.
- **The judge shares a family with the model it grades**, which is a known bias.
  `EVAL_JUDGE_MODEL` overrides it, and re-running under a different judge to see
  whether the verdicts move is the cheapest way to test for it.
- **Latency, cost per user, streaming and rate limiting are out of scope.** The
  harness reports what a run spent, which is not the same as what a user costs.
- **A green suite is not a good product.** These cases were chosen for the
  failures they can catch. Real submissions will find failures nobody thought to
  write down; when one turns up, it belongs here as a case before it is fixed.
