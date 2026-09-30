---
status: ready
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

- [ ] The failing condition is reproduced with a stable reproduction (load/timing or real race)
- [ ] Root cause is identified: test timing assumption or product race
- [ ] Full `cd pi-tether && npm run check` passes repeatedly (≥5 consecutive runs) after the fix
