---
status: ready
issue_id: "051"
tags: [mom, cadence]
dependencies: []
forked_from: "050"
supersedes: []
---

# Coalesce Mom's ordinary update cadence

## Outcome

Mom reasons about accumulated work, not each message, settled lead turn, or delegate completion.

## Context

The user approved eventual consistency and the independent Astra review's tentative starting gate: update after five completed lead exchanges, or after at least two exchanges have accumulated and the oldest has waited ten minutes. Flush pending evidence at compaction and on explicit `/mom refresh` or direct Mom questions. Those thresholds are starting points to replay, not established best practice. The 049 owner released the overlapping source by explicit hunk; the one-line `mom-bootstrap-chapters` description is preserved. This todo's implementation is included in commit `8473018` with 049/052. Cadence replay evidence remains open; do not edit `mother.ts`, `contract.ts`, bootstrap, panel, or 049 tests as part of follow-up tuning.

## Acceptance criteria

- [ ] A lone settled lead exchange does not invoke Mom or Kev; no inference-per-turn or periodic polling.
- [ ] At the threshold, one coalesced update runs only at a safe idle boundary; the ten-minute path uses one one-shot deadline only when at least two exchanges are pending.
- [ ] Multiple delegate completions in one work wave coalesce and are not double-counted against the lead settlement.
- [ ] Compaction and explicit user refresh/query bypass the ordinary gate; background catch-up preserves event order and cursor safety.
- [ ] Tests use a clock/event fixture to prove the boundaries and count Mom/advisor calls separately; replay evidence reports cadence, evidence lag, and cost before tuning thresholds.
- [ ] `pi-tether` and applicable `pi-delegate` checks pass at a stable SHA.

## Out of scope

- Cold bootstrap, graph prompt/schema changes, per-message semantic screening, pi-intercom changes.

## Evidence

- Integrated in the shared working tree: ordinary inference gates at five lead settlements, or at least two settlements with the oldest aged ten minutes; delegate settlements update evidence/revision but do not count as lead exchanges. One-shot timer only; no idle polling. Compaction, explicit refresh, and direct Mom questions bypass the ordinary gate. `/mom correct` uses explicit refresh; pending refresh batches continue until caught up.
- Extension tests cover delegate exclusion, one coalesced Kev screen separate from Mom, no-movement screening, and compaction/question bypass. Focused extension suite passed 14/14; compaction + recovery tests passed 7/7. `cd pi-tether && npm run check` passed typecheck and 158/158 tests at commit `8473018`. The replay acceptance criterion (cadence, evidence lag, and cost before tuning) remains open.
- Shared-worktree cross-package checks are not green: `cd pi-delegate && npm run check` fails typecheck in `src/render.ts` and `src/transcript.ts`; separate `npm test` reports 246 pass, 2 fail, 19 skipped. Those delegate edits are not included in `8473018`; the failing package state is not treated as a stable-SHA result for this todo.
- Read-only scout preparation completed 2026-10-01. It confirmed the helper's 5-lead / 2-aged-lead logic, explicit bypass paths, and existing one-shot timer; identified missing integration coverage and a timer-fired-while-busy path that may fail to reschedule. No scout edits or provider calls.
- 049 owner handoff: the only 049 `index.ts` hunk was the `mom-bootstrap-chapters` description line; preserved in `8473018`. 049's real-model capture remains open.
