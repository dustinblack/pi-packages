---
status: ready
issue_id: "035"
tags: [pi-delegate, skill, doctrine, orchestration]
dependencies: []
---

# Delegation guidance keeps each child responsible for one bounded artifact

## Outcome

The shipped delegation skill teaches and demonstrates a small, auditable unit of delegation: one child owns one bounded artifact or decision, with external-model experiments, implementation, review, integration, and closure split when their failure modes differ.

## Context

- Mom finish-line work bundled design, code, live Luna replay, scoring, privacy checks, review, and Git integration into single children.
- Recoverable model/provider failures then invalidated or stalled the entire task.
- Repeated steering of exhausted children produced stale reports and confusing timeout state.
- The correct rule is operational doctrine, not a heuristic that rejects long prompts.

## Acceptance criteria

- [ ] `skills/delegation/SKILL.md` states: one child, one bounded artifact or decision surface
- [ ] Guidance separates deterministic code/tests from external-model or network experiments
- [ ] Guidance requires checkpointed private evidence before long experiments and a single stated stop condition
- [ ] Guidance says a failed experiment becomes evidence/blocker, not an automatic retry loop
- [ ] Guidance prohibits repeated scheduled status prompts; use one factual status read on request and `wait` only when nothing else can proceed
- [ ] Guidance prefers a fresh handoff over repeatedly steering an exhausted or provider-failing child
- [ ] Examples show implementation → fresh review → integration as separate ownership boundaries
- [ ] Tool descriptions and role prompts use the same terminology without claiming runtime features that do not exist
- [ ] Package checks and skill-trigger/evaluation checks pass

## Out of scope

- Runtime enforcement based on prompt length or guessed complexity
- Automatically decomposing a user's request

## Evidence
