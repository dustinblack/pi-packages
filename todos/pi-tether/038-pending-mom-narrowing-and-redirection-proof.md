---
status: pending
issue_id: "038"
tags: [mom, pi-tether, acceptance]
dependencies: ["008"]
---

# Mom visibly records narrowing and redirection on a live session

## Outcome

A live capture shows Mom recording the two things the 008 audit found missing: when the user narrows or drops scope, the account visibly shrinks; when the user changes direction, the replaced center is parked and focus moves in the same transaction.

## Context

- The Option C audit (`pi-tether/experiments/trajectory-acceptance/case-audit.json`) found 2 of 15 cases with possible map defects, both the same weakness: contractions and redirections that leave the node set unchanged are invisible. `ssmp-conflict-01` never represented a redirect at its horizon; `pi-stale-01` recorded nothing when scope narrowed.
- Prompt fix landed on main (todo 037 closure commit): the contract now requires parking the replaced center and moving focus on a redirect, and retiring what no longer holds on a narrowing.
- Prompt-level fixes are observable only in live sessions; deterministic tests cover the contract shape, not model behaviour.

## Acceptance criteria

- [ ] A live session (or loopback-fidelity capture) produces one narrowing where the after-map has fewer active records than before
- [ ] A live session produces one redirect where the replaced center is parked and focus moved in the same transaction
- [ ] Both observations are preserved with durable paths, and the widget/read shows them without manual repair
- [ ] If the prompt fix does not produce them, the follow-up todo names the measured cause (prompt wording, evidence window, or host validation)

## Out of scope

- Changing the measurement protocol or reopening todo 008's label study. That gate is retired.
