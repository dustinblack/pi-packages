---
status: complete
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

- [x] Each risk class has a positive test and a negative test
- [x] At most one notice per unresolved risk
- [x] Plain English, with no internal jargon
- [x] Live capture of one real advisory

## Evidence

- Main implementation: `a2211d0` (worker/salvage branch `bc0afa0`). Integrated with dedicated Mom view `58ac5a0` and the owner's widget repaint fix `779d6b3`; deleted per-tool repaint hooks remain deleted.
- On combined main, `cd pi-tether && npm run check` passed 128 tests; `cd pi-delegate && npm run check` passed 40. Coverage includes class-specific positive/negative evidence prerequisites, reload suppression, genuine recurrence, and atomic resolution under injected write failure. The host checks protocol facts; Mom judges semantic risk, permission, and actionability without keyword heuristics.
- `cd pi-tether && npx tsx test/terminal-mom-proof.ts` passed after integration. Mom switch/answer/return preserved the lead transcript and draft.
- Two controlled-transcript captures generated real Luna advisories and verified one notice across reload without an extra lead turn. Each used two Mom calls. Both saved evidence before hanging on the capture process's connection-pool cleanup. Cleanup now targets the SDK's nested pi-ai pool; an offline recorded-response rerun exited cleanly. The cleanup change was not rerun against the live provider. This establishes the captured advisory and delivery, not general semantic reliability.
- Real-provider receipts, warnings, and capture limitations: `pi-tether/experiments/evidence/todo-011/`. The opt-in capture script also passed standalone strict ES2023 typechecking.
- Delivery is durably reserved before publishing. A crash can lose an advisory rather than duplicate it. Resolution and consumed evidence commit in one map record. Former obligation/trigger notice records are incompatible; no session transcript or existing user sidecar was altered.
