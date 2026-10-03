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

trunk: 049 — bounded cold catch-up and continuation behavior committed at `8473018`; frozen-copy replay, stable-SHA Tether checks, and a real-model checkpoint are verified. The real map is semantically wrong about the current sidecar state and omits worker/tangent branches; 049 remains open for semantic repair/revalidation.
tangents: 051 — cadence implementation and no-provider replay completed; the 5/2/10-minute values remain unvalidated starting points. 052 — incremental thread-map implementation committed and verified at `8473018`.

## Findings

- User-approved direction: eventual consistency; no model call per message or settled turn. Compact several exchanges into an update.
- Oracle proposal for replay starting points: five completed lead exchanges, or at least two pending exchanges whose oldest evidence is ten minutes old; flush on compaction or explicit request. These thresholds are unvalidated.
- Apply thread-map principles to both bootstrap and incremental updates: normalize, cite fixed-schema state, diff prior state, check compaction summaries against raw evidence, compact stale/duplicate nodes.
- 24K characters may bound request size; it must not define a model invocation or semantic chapter.
- Earlier frozen-copy baseline (65,464,222 bytes): one digest then 17 ordinary slice proposals after a checkpoint, 18 local fixture requests total, zero real model calls; 25 missing-worker transcript gaps remained visible. That exposed the `!checkpoint` continuation bug.
- Independent replay after the fix (frozen copy, 65,762,902 bytes / 9,265 branch entries): 157 local capture windows drained in 2 scripted fixture proposals (140 then 17 windows); zero real provider calls; the same 25 missing-worker gaps stayed visible; final durable cut resolved to the branch leaf and all graph citations resolved. This proves bounded catch-up/cursor behavior against this frozen transcript shape, not Mom's semantic map quality; the fixture deliberately emits one synthetic node.
- The former 26-vs-24 overshoot came from not counting the initial staged window. 049 documents `maxChapters` as a target crossed only at a capture-window boundary and returns an `overshoot` count; exact-max enforcement would require cursor surgery.
- 051 cadence is batched (5 lead settlements, or 2 with a 10-minute oldest-evidence age); delegates do not satisfy the lead threshold, and compaction/explicit user direction bypasses it. A one-shot timer replaces polling. Replay of the active portion of this transcript estimates 46 ordinary + 14 compaction updates in 79.39 hours (successful-stop scenario); the optional Kev advisor is disabled by default.
- 052 applies normalized, cited chapter state and diffs to incremental updates; compaction summaries are checked against raw evidence, and the durable cursor is not advanced on rejection. `chapterBoundary` avoids rescanning prior feed history on each update.

## Children

- 049 — fixture/replay and stable-SHA Tether checks pass; real-model run produced a durable cut in 3 calls but failed semantic reconciliation: assistant line 9462 says there is no active sidecar, while the graph asserts one exists and leaves an obsolete repair/pause choice proposed. Worker/tangent coverage is also missing. Remains open — `todos/pi-tether/049-ready-mom-cold-catchup.md`.
- 051 — complete at `8473018`; replay evidence archived. Pi-delegate cross-package checks were expressly excluded by the user and were not performed — `todos/pi-tether/051-complete-mom-live-cadence.md`.
- 052 — complete at `8473018` — `todos/pi-tether/052-complete-ready-mom-incremental-thread-map.md`.

## Outcome

Mom catches up on long histories without one proposal per feed slice and keeps the live map usefully current without inference on every turn.

## Context

pi-tether owns Mom's event feed, graph, checkpoint, prompt, and widget. `capture(24000)` is a size bound. Bootstrap code landed at `8e6ed0c`; replay exposed and the 049/051/052 changes committed together at `8473018`. Tether typecheck and 158/158 tests pass at that SHA. The shared pi-delegate ACP edits remain outside this commit and their current working-tree check is not green. Preserve `.mom` as the only durable graph state; no second ledger, no pi-intercom changes.

## Acceptance criteria

- [x] 049 bounded schedule/cursor behavior is verified against the frozen real-session copy: 157 windows → 2 fixture proposals; 25 unavailable-worker gaps remain visible; stable-SHA Tether checks pass at `8473018`.
- [x] 051 batches settled activity; tests cover one exchange, five-exchange threshold, age deadline, compaction/explicit bypass, and delegate exclusion.
- [x] 052 uses normalized, source-cited state and diffs; summary-vs-raw checks and active compaction apply to incremental updates as well as bootstrap.
- [x] Replay evidence reports update opportunities, Mom/Kev calls, evidence age, nominal cost reference, and the observed stale-state error; the five-node output has no duplicate IDs. Evidence: `pi-tether/experiments/evidence/todo-049-live-cold-capture.json` and `pi-tether/experiments/evidence/todo-051-cadence-replay.json`.
- [ ] Real-model map quality reconciles the latest raw user direction and retains the relevant branch navigation. The 2026-10-01 capture fails on current sidecar state and omits worker/tangent branches; do not call this production-ready.
- [x] Tether checks pass at stable SHA `8473018`. Pi-delegate checks are outside the user's requested scope and were not run; no delegate package files were touched.

## Out of scope

- Realtime semantic classification of every message or another model call as a per-event screen.
- pi-delegate/pi-intercom product changes, second history ledger, silent evidence skipping, or unrelated graph redesign.

## Evidence

- Integrated cadence + incremental thread-map implementation: commit `8473018`; `cd pi-tether && npm run check` passed typecheck and 158/158 tests at that stable SHA. Focused suites also passed: extension 14/14; incremental + bootstrap 11/11; compaction + recovery 7/7. The real-model 049 capture and 051 replay are now archived; the former found a semantic error, and the latter leaves threshold tuning undecided.
- Cross-package verification remains incomplete. Earlier reports recorded a stale delegate integration expectation and a later TS7053 during concurrent ACP changes. The current user explicitly directed this task to leave pi-delegate alone, so no package source/test files were inspected, edited, or rerun; do not claim that package is green.
