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
