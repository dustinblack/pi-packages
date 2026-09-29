---
status: ready
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

- [ ] With Mom enabled, the instruction text is present in the lead's system prompt in a live session (captured)
- [ ] With Mom disabled, it is absent
- [ ] A test covers both
