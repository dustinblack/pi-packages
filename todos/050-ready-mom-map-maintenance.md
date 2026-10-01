---
status: ready
issue_id: "050"
tags: [mom, graph, catch-up]
dependencies: []
forked_from: ""
supersedes: []
---

# Mom map maintenance: catch-up, cadence, and compaction

## Where we are

trunk: 049 — bounded cold catch-up and continuation behavior committed at `8473018`; frozen-copy replay and stable-SHA Tether checks pass. Real-model semantic capture remains open.
tangents: 051 — cadence implementation committed at `8473018`; replay evidence/tuning remains open. 052 — incremental thread-map implementation committed and verified at `8473018`.

## Findings

- User-approved direction: eventual consistency; no model call per message or settled turn. Compact several exchanges into an update.
- Oracle proposal for replay starting points: five completed lead exchanges, or at least two pending exchanges whose oldest evidence is ten minutes old; flush on compaction or explicit request. These thresholds are unvalidated.
- Apply thread-map principles to both bootstrap and incremental updates: normalize, cite fixed-schema state, diff prior state, check compaction summaries against raw evidence, compact stale/duplicate nodes.
- 24K characters may bound request size; it must not define a model invocation or semantic chapter.
- Earlier frozen-copy baseline (65,464,222 bytes): one digest then 17 ordinary slice proposals after a checkpoint, 18 local fixture requests total, zero real model calls; 25 missing-worker transcript gaps remained visible. That exposed the `!checkpoint` continuation bug.
- Independent replay after the fix (frozen copy, 65,762,902 bytes / 9,265 branch entries): 157 local capture windows drained in 2 scripted fixture proposals (140 then 17 windows); zero real provider calls; the same 25 missing-worker gaps stayed visible; final durable cut resolved to the branch leaf and all graph citations resolved. This proves bounded catch-up/cursor behavior against this frozen transcript shape, not Mom's semantic map quality; the fixture deliberately emits one synthetic node.
- The former 26-vs-24 overshoot came from not counting the initial staged window. 049 documents `maxChapters` as a target crossed only at a capture-window boundary and returns an `overshoot` count; exact-max enforcement would require cursor surgery.
- 051 cadence is batched (5 lead settlements, or 2 with a 10-minute oldest-evidence age); delegates do not satisfy the lead threshold, and compaction/explicit user direction bypasses it. A one-shot timer replaces polling.
- 052 applies normalized, cited chapter state and diffs to incremental updates; compaction summaries are checked against raw evidence, and the durable cursor is not advanced on rejection. `chapterBoundary` avoids rescanning prior feed history on each update.

## Children

- 049 — committed at `8473018`; fixture/replay and stable-SHA Tether checks pass; real-model semantic capture remains open — `todos/049-ready-mom-cold-catchup.md`.
- 051 — committed at `8473018`; Tether checks pass; cadence replay evidence/tuning and green applicable delegate verification remain open — `todos/051-ready-mom-live-cadence.md`.
- 052 — complete at `8473018` — `todos/052-complete-ready-mom-incremental-thread-map.md`.

## Outcome

Mom catches up on long histories without one proposal per feed slice and keeps the live map usefully current without inference on every turn.

## Context

pi-tether owns Mom's event feed, graph, checkpoint, prompt, and widget. `capture(24000)` is a size bound. Bootstrap code landed at `8e6ed0c`; replay exposed and the 049/051/052 changes committed together at `8473018`. Tether typecheck and 158/158 tests pass at that SHA. The shared pi-delegate ACP edits remain outside this commit and their current working-tree check is not green. Preserve `.mom` as the only durable graph state; no second ledger, no pi-intercom changes.

## Acceptance criteria

- [ ] 049 schedule/cursor behavior is verified against a frozen copy of the real long session using a local fixture: 157 windows → 2 proposals; 25 unavailable-worker gaps remain visible. Semantic map quality is not proven by this fixture, and stable-SHA verification remains pending.
- [ ] 051 batches settled activity; one exchange alone causes no automatic inference; compaction and explicit refresh flush pending evidence; delegate settlements coalesce.
- [ ] 052 uses normalized, source-cited state and diffs; summary-vs-raw checks and active compaction apply to incremental updates as well as bootstrap.
- [ ] Replay reports Mom and advisor calls, evidence lag, map quality, and stale/duplicate-node behavior; thresholds remain evidence-tuned, not asserted as best practice.
- [ ] Tether and delegate checks pass at stable committed SHAs.

## Out of scope

- Realtime semantic classification of every message or another model call as a per-event screen.
- pi-delegate/pi-intercom product changes, second history ledger, silent evidence skipping, or unrelated graph redesign.

## Evidence

- Integrated cadence + incremental thread-map implementation: commit `8473018`; `cd pi-tether && npm run check` passed typecheck and 158/158 tests at that stable SHA. Focused suites also passed: extension 14/14; incremental + bootstrap 11/11; compaction + recovery 7/7. 049 still needs a real-model cold-catch-up capture; 051 still needs replay-based cadence/evidence-lag/cost analysis.
- Cross-package verification remains incomplete. At committed code after ACP review `176bee2`, `pi-delegate` typecheck passed but `npm test` reported 249 pass / 1 fail / 19 skipped; the failure was `test/tether-feed.test.ts` expecting an immediate Mom wake on delegate settlement, contrary to 051's cadence. Updated that integration test locally to assert the delegate alone does not wake Mom, then confirm the worker narrative is captured at cadence; focused test passed 1/1. A subsequent full check ran while separate ACP edits were changing the shared tree and failed typecheck with TS7053 in `test/backend-contract.test.ts`; no ACP implementation files were edited here. Full delegate verification on a stable tree remains open.
