---
status: complete
issue_id: "009"
tags: [mom, pi-tether]
dependencies: ["002"]
---

# The lead's standing instructions carry the user's pivot and assent rules

## Outcome

Whenever Mom is enabled, the lead agent's standing instructions include the user's rules for pivots and assent.

## Context

- Pivot rule, verbatim [6191]: "the user pivots fast and never announces it; treat every direction change as an implicit park, log the abandoned thread silently, never ask for confirmation, never slow them down, surface parked threads only when the current work collides with one or at session start."
- Assent rule [6237]: remarks like "yes, note that" and "yes, lets go down that path" are always noted and respected, and Mom re-verifies them when later direction seems to conflict.
- Suggested placement: Mom's `before_agent_start` system-prompt addition in pi-tether, so the rules travel with Mom. This repo has no AGENTS.md.

## Acceptance criteria

- [x] With Mom enabled, the instruction text is present in the lead's system prompt in a live session (captured)
- [x] With Mom disabled, it is absent
- [x] A test covers both

## Evidence

- Substantive commit `be537b426c8e4ab11b3a3fa4fbdf494eac3764fa`; non-fast-forward merge `45a85e6254c153c48e2ec4813f12841476121fef`.
- Safe live capture: `pi-tether/experiments/evidence/todo-009-lead-instructions-capture.json` (SHA-256 `7ebb37a07004877c0e320706e5587fa3fdb5cbff931082e52e5033178cfaeab9`). Secret-pattern inspection found no credentials, authorization headers, passwords, or API keys.
- Capture outcome: enabled prompt contains `<mom_lead_behavior>` exactly once; after `/mom pause`, the disabled prompt contains no section.
- `npx tsx --test test/lead-instructions.test.ts`: 1/1 passed.
- `cd pi-tether && npm run check`: typecheck and 95/95 tests passed. `git diff --check`: passed.
