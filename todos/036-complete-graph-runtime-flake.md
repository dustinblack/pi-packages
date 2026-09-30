---
status: complete
issue_id: "036"
tags: [pi-tether, tests, flake]
dependencies: []
---

# graph-runtime full-suite timing flake is reproduced and fixed

## Outcome

`pi-tether/test/graph-runtime.test.ts` passes reliably in the full `npm run check` run, not only in isolation.

## Context

- Observed 2026-09-30 during todo 012 main verification: the full suite failed once with
  `agents read current neighborhoods, folded history and original sources without inference; cold restore preserves the compacted graph`
  asserting the partial-snapshot status instead of `/main|Original recorded evidence/`.
- The same test passed when run alone and on the immediate full-suite rerun (137/137).
- Gate to work this: the failure reproduces in a full-suite run again, or a test-hardening pass is scheduled.

## Acceptance criteria

- [x] The failing condition is reproduced with a stable reproduction (load/timing or real race)
- [x] Root cause is identified: test timing assumption or product race
- [x] Full `cd pi-tether && npm run check` passes repeatedly (≥5 consecutive runs) after the fix

## Evidence

- Fix: `7df9113` on main (branch commit `3b15816`), test-only: `pi-tether/test/graph-runtime.test.ts` (+13/−2). No src change required.
- Root cause: the test waited only for the durable sidecar snapshot (`until(checkpoints().length === N)`) but `src/mother.ts:323` writes the snapshot before `:325` publishes it in memory and before coverage settles (`usage` append, `coveredRevision`, `busy=false`, `run()` bookkeeping). Under CPU load the test's own fs read wins the race and the read returns the transitional "still catching up" / "has not saved an account" view. A test timing assumption, not a product race.
- Fix: `readCurrent()` polls the `mom` tool read until `details.data.coverageComplete === true`, then runs the original `read()` with every original assertion untouched. `restored` reads legitimately run with `coverageComplete === false` and are not polled.
- Reproduce pre-fix: 60-run full-suite contention + 60-run parallel hammer of this file = 3/126 failures, byte-identical to the 2026-09-30 evidence. Post-fix: 60/60 hammer, 0/60 full-suite contention failures.
- Proof: 5 consecutive full `npm run check` passes (137/137 each) and `pi-delegate` 40/40 on the fix worktree; main after cherry-pick: 137/137.
- Residual (out of ownership, untouched): `test/extension.test.ts` has its own pre-existing timing flakes under 2× simultaneous full-suite contention (2/60 both before and after; unchanged rate).
