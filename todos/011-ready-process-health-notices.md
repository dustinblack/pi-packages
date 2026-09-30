---
status: ready
issue_id: "011"
tags: [mom, pi-tether, notices]
dependencies: ["005"]
---

# Mom speaks up once, briefly, when the agents' process puts the work at risk

## Outcome

Mom speaks up once, briefly, when the working agents' process puts the user's work at risk:
- context is about to compact with decisions unrecorded
- work is piling up uncommitted while commits are allowed
- the work is drifting from the goal
- the same fix keeps failing

## Context

- The user endorsed this on 2026-09-28 (the mom-and-graphs thread).
- Proposed wording is in MOM-HANDOFF.md.
- It must not nag; pi-omp's "you stopped with N open todo items" is the anti-pattern.
- Mom never gates or dispatches.
- An advisory needs current evidence that the risk is consequential and actionable. Raw thresholds alone are not enough.
- It reuses the 005 notice delivery.

## Acceptance criteria

- [ ] Each risk class has a positive test and a negative test
- [ ] At most one notice per unresolved risk
- [ ] Plain English, with no internal jargon
- [ ] Live capture of one real advisory

## Integration state

- Implementation is committed on `todo-011` as `bc0afa0`, not yet on main. Its package check passes 126 tests, including per-class positive/negative evidence prerequisites, reload suppression, genuine recurrence, and atomic resolution under injected write failure.
- Two controlled-transcript captures generated real Luna advisories and verified one notice across reload with no extra lead turn. Both saved evidence before hanging on the capture process's connection-pool cleanup. The cleanup now targets the SDK's nested pi-ai pool; an offline recorded-response rerun exited cleanly. This does not establish general semantic reliability. Evidence: `pi-tether/experiments/evidence/todo-011/` on that branch.
- Main integration stopped because concurrent uncommitted widget repaint changes touch `pi-tether/src/index.ts` and `pi-tether/test/extension.test.ts`. Their owners were contacted; no changes were overwritten or stashed. Resume once those changes are committed, then run the combined checks and close this todo.
