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

The user approved eventual consistency and the independent Astra review's tentative starting gate: update after five completed lead exchanges, or after at least two exchanges have accumulated and the oldest has waited ten minutes. Flush pending evidence at compaction and on explicit `/mom refresh` or direct Mom questions. Those thresholds are starting points to replay, not established best practice. The 049 owner released the overlapping source by explicit hunk: preserve the one-line `mom-bootstrap-chapters` description change in `src/index.ts`; 049's stable-SHA closure remains open. This todo owns `src/index.ts`, `src/cadence.ts`, and cadence/extension tests. The tree already contains an unverified partial cadence patch; inspect and complete it rather than replacing it. Do not edit `mother.ts`, `contract.ts`, bootstrap, panel, or 049 tests.

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
- Extension tests cover delegate exclusion, one coalesced Kev screen separate from Mom, no-movement screening, and compaction/question bypass. Focused extension suite passed 14/14; compaction + recovery tests passed 7/7. Full `cd pi-tether && npm run check` passed typecheck and 158/158 tests in the shared working tree. These are working-tree results, not stable-SHA verification; do not mark complete before the closing commit exists.
- Read-only scout preparation completed 2026-10-01. It confirmed the helper's 5-lead / 2-aged-lead logic, explicit bypass paths, and existing one-shot timer; identified missing integration coverage and a timer-fired-while-busy path that may fail to reschedule. No scout edits or provider calls.
- 049 owner handoff: the only 049 `index.ts` hunk is the `mom-bootstrap-chapters` description line; preserve it. File-level release does not close 049's stable-SHA criterion.
