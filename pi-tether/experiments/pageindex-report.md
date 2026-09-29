# PageIndex-style retrieval comparison

Date: 2026-09-29. Todo: 013. Model: `openai-codex/gpt-5.6-luna`, low reasoning, no fallback.

## Question and grading contract

The three questions and all grading rules were written before model calls in [`pageindex-questions.json`](./pageindex-questions.json) (SHA-256 `ccffe078ed944a49d4d4703df00bb98d1cee2e8037b33a155c1c6b905506cd5c`). Each answer had to match every expected pattern and cite an original source that the model had inspected.

- Pi and SSMP used exact-source grading.
- Buzz allowed an equivalent original source only when that source itself matched every pattern and the predeclared tool-result metadata.
- Both conditions allowed five model calls and two 4,000-character source reads. Search additionally allowed two metadata searches.

The same question, source prefix, Luna model, and source-read budget were used for both conditions:

1. **Search:** no map; production vectorless/literal ranking, then source inspection.
2. **Map:** no search; the saved graph, then inspection of source handles cited by that graph.

## Results

| Question | Search | Calls | Map | Calls |
|---|---:|---:|---:|---:|
| Pi TypeScript TS1005 | fail | 4 | fail | 3 |
| Buzz Python `sub()` TypeError | pass | 3 | fail | 3 |
| SSMP broken roadmap link | fail | 4 | fail | 3 |
| **Total** | **1/3** | **11** | **0/3** | **9** |

Aggregate usage:

| Condition | Input | Output | Cache read | Nominal cost | Elapsed |
|---|---:|---:|---:|---:|---:|
| Search | 15,427 | 917 | 0 | $0.0041858 | 31.4 s |
| Map | 36,617 | 1,255 | 0 | $0.0088294 | 42.0 s |

**Winner: current search, by accuracy (1/3 versus 0/3).** Map navigation used two fewer calls but was less accurate and more expensive because each request carried the graph. It does not justify a production navigation change.

Notable grading outcomes:

- Buzz search found and cited a later equivalent original tool result containing the exact TypeError, so it passed under the predeclared equivalent-source rule.
- Buzz map produced the right text but cited a user-direction source whose payload did not contain the error. It failed rather than receiving answer-only credit.
- Pi search and map inspected plausible but wrong sources. Neither recovered TS1005.
- SSMP search found a different broken link; map did not have the expected source handle in its 887/903-event saved prefix. Both failed.

## Reproduce

The private bundles and saved map summaries named by the input manifest must still exist. Output must be a new directory.

```sh
cd pi-tether
./node_modules/.bin/tsx experiments/pageindex-compare.ts \
  experiments/pageindex-questions.json \
  /private/tmp/todo-013-pageindex-inputs.json \
  /private/tmp/new-todo-013-pageindex-run
```

Audit artifacts for this run are under `/private/tmp/todo-013-pageindex-run-20260929/`. [`pageindex-artifacts.json`](./pageindex-artifacts.json) records every file's size and SHA-256. [`pageindex-results.json`](./pageindex-results.json) is the compact machine-readable result.

Verification:

```sh
./node_modules/.bin/tsc --noEmit --target ESNext --module ESNext \
  --moduleResolution bundler --types node --strict --skipLibCheck \
  --allowImportingTsExtensions --verbatimModuleSyntax \
  experiments/pageindex-compare.ts
python3 -m json.tool experiments/pageindex-questions.json >/dev/null
python3 -m json.tool experiments/pageindex-results.json >/dev/null
python3 -m json.tool experiments/pageindex-artifacts.json >/dev/null
```

The harness opens original transcript sources read-only and writes only to the newly created output directory. It does not open or write any `.mom` file and does not mutate a session JSONL.

## Limitations

- This is one run per condition over three already-familiar corpora, not a reliability estimate.
- The SSMP map covered 887 of 903 events because that preserved production replay stopped before completion. The expected failure source was in the observed prefix but absent from graph source handles.
- Map source arrays are unlabeled handles; PageIndex's richer structural page descriptions are not represented here.
- The probes intentionally target facts buried in tool output. Results do not measure ordinary map orientation quality.
- Cache reads were zero in both conditions.

Because map navigation did not win, todo 013's production-change gate remains closed. No follow-up implementation todo is recommended from this result.
