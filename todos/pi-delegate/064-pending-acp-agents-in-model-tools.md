---
status: pending
issue_id: "064"
tags: [pi-delegate, acpx, models]
dependencies: []
forked_from: "039"
---

# Decide whether ACP agents become first-class in the model tools

## Outcome

The parent agent can compare and choose an ACP agent, and that agent's model, with the same research → propose → approve discipline it already uses for pi offerings. Or the user decides the model tools stay pi-only, and the reason is recorded.

## Context

- `delegate_ctl models`, `rate` and `approve` cover pi offerings (`provider/id[:thinking]`) only: DEFAULTS/DRIFT, live OpenRouter facts, AA ratings, approved defaults per role in `~/.pi/agent/delegate-models.json`.
- ACP agents (Codex, Claude, Amp, OpenCode…) have their own model IDs, and often subscription billing. Codex reported no cost in the 048 smoke.
- After the 2026-10-01 interim change, a created ACP run's status shows its current and available model IDs, the skill explains choosing between a pi child and an ACP agent, and a pi-style `provider/id` passed as an ACP `model` is rejected.
- Open questions:
  - should `models` list ACP agents and their discoverable models, which needs a live session per agent?
  - can `rate` and `approve` key on `acp:<agent>/<model>`?
  - should a role get an approved default agent?

## Acceptance criteria

- [ ] The user decides: ACP agents in the model tools, or pi-only by design.
- [ ] If included: `models` lists ACP agents with their discoverable models and a billing note, `rate`/`approve` accept ACP keys, and DRIFT covers them.
- [ ] The skill's "Model per role" reflects the decision.

## Out of scope

Changing pi offering research; ACP writer confinement (060).

## Evidence

Filed 2026-10-01 after the user asked that model-selection guidance not get lost in the fold-in.
