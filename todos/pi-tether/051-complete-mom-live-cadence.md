---
status: complete
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

The user approved eventual consistency and the independent Astra review's tentative starting gate: update after five completed lead exchanges, or after at least two exchanges have accumulated and the oldest has waited ten minutes. Flush pending evidence at compaction and on explicit `/mom refresh` or direct Mom questions. Those thresholds are starting points to replay, not established best practice. The 049 owner released the overlapping source by explicit hunk; the one-line `mom-bootstrap-chapters` description is preserved. This todo's implementation is included in commit `8473018` with 049/052. The no-provider cadence replay completed on 2026-10-01; evidence is in `pi-tether/experiments/evidence/todo-051-cadence-replay.json`. Thresholds remain starting points, not best practice; do not tune them without a separate decision. Do not edit `mother.ts`, `contract.ts`, bootstrap, panel, or 049 tests as part of cadence follow-up.

## Acceptance criteria

- [x] A lone settled lead exchange does not invoke Mom or Kev; the ordinary path is batched, with no inference-per-turn or periodic polling.
- [x] The five-exchange and two-exchange/ten-minute gates use a one-shot timer and run only at an idle boundary; one-shot wake scheduling is visible in `src/index.ts`.
- [x] Delegate completions do not count toward the lead threshold; multiple delegate notices do not cause an ordinary wake.
- [x] Compaction and explicit refresh/query bypass the ordinary gate; cursor coverage advances only with accepted updates.
- [x] Numeric-time cadence tests and extension call-count tests cover thresholds and Mom/Kev separation; the bounded no-provider replay reports call opportunities, evidence lag, and cost in the evidence file.
- [x] Tether typecheck and 158/158 tests passed at stable SHA `8473018`. Cross-package pi-delegate checks were expressly excluded by the user; no pi-delegate files were inspected or changed in this task.

## Out of scope

- Cold bootstrap, graph prompt/schema changes, per-message semantic screening, pi-intercom changes.

## Evidence

- Integrated in the shared working tree: ordinary inference gates at five lead settlements, or at least two settlements with the oldest aged ten minutes; delegate settlements update evidence/revision but do not count as lead exchanges. One-shot timer only; no idle polling. Compaction, explicit refresh, and direct Mom questions bypass the ordinary gate. `/mom correct` uses explicit refresh; pending refresh batches continue until caught up.
- Extension tests cover delegate exclusion, one coalesced Kev screen separate from Mom, no-movement screening, and compaction/question bypass. Focused extension suite passed 14/14; compaction + recovery tests passed 7/7. `cd pi-tether && npm run check` passed typecheck and 158/158 tests at commit `8473018`. The cadence replay is recorded below; it evaluates frequency, not whether these thresholds are optimal.
- At committed code after ACP review `176bee2`, `pi-delegate` typecheck passed but `npm test` had one failure: `test/tether-feed.test.ts` expected a Mom wake from delegate settlement alone. Updated that integration test to honor the 051 lead cadence; `cd pi-delegate && npx tsx --test test/tether-feed.test.ts` passed 1/1. A subsequent full package check ran during separate shared ACP edits and failed typecheck with TS7053 in `test/backend-contract.test.ts`; full delegate-suite verification at a stable tree remains open. The Mom/Tether changes are committed at `8473018` and pass `cd pi-tether && npm run check` (158/158).
- Read-only scout preparation completed 2026-10-01. It confirmed the helper's 5-lead / 2-aged-lead logic, explicit bypass paths, and existing one-shot timer; identified a timer-fired-while-busy path whose retry depends on the next lead settlement. No scout edits or provider calls.
- Cadence replay completed 2026-10-01 with no provider calls. From the first recorded Mom ledger event through transcript end (79.39 hours), the successful-stop scenario has 129 lead settlements, 46 ordinary update opportunities, and 14 compaction bypasses: 60 total update opportunities, or 18.1/day. Ordinary batches contain 2–5 settlements. Oldest evidence age: p50 10 minutes, p90 55.5 minutes, max 477.9 minutes; the maximum is a lone settlement waiting for a second settlement, since one item alone never starts the age timer. Two settlements were pending at transcript end, oldest 9.5 minutes.
- Sensitivity including all 128 error/abort terminal records raises the scenario to 75 ordinary + 14 compaction updates (89 total, 26.9/day). Raw JSONL does not encode `agent_settled`, so these are counterfactual update opportunities, not observed historical Mom calls. Nine Mom-tool calls in the parent transcript were cached reads with no question; no question-driven Mom tool call was recorded.
- The replay made zero Mom or Kev calls and cost $0. The 049 live cold-catch-up sample cost $0.00784288 for two update passes (three provider calls); using that small cold-backlog sample to project 60 updates gives about $0.24 nominal, explicitly not a forecast. The 5/2/10-minute values remain unvalidated starting points; this busy-thread replay shows they can still yield roughly 14 ordinary wakes/day plus compaction bypasses.
- pi-delegate cross-package verification was not performed, per the user's explicit scope instruction. No pi-delegate files were inspected, edited, or tested.
- 049 owner handoff: the only 049 `index.ts` hunk was the `mom-bootstrap-chapters` description line; preserved in `8473018`. 049's real-model capture ran; its semantic acceptance remains open.
