---
status: ready
issue_id: "048"
tags: [pi-delegate, acpx, smoke]
dependencies: ["046", "047", "053"]
forked_from: "039"
---

# Prove unified delegation on real Pi and ACP providers

## Outcome

The installed pi-delegate, with pi-strings gone, runs end to end: one ordinary Pi child and one authorized ACP/provider child, plus the existing Amp Orb/native path where credentials permit.

## Context

Fixtures cannot prove process boundaries, provider identity, native executor preservation or user-facing attribution. Keep prompts read-only. Use only existing approved targets, not fresh scratch threads: the user objected on 2026-09-30 to custom test threads left behind as a mess.

Approved targets (user, 2026-10-01):
- Existing max-planner Orb thread `T-01a0f0b4-5330-714f-a024-0a156279b832`: open, observe, and one short marker steer. It is multiplayer, so everyone in it sees the marker. Send nothing else.
- One new local Amp thread, created and labeled by delegate, with a read-only prompt, then closed.
- One real Pi child and one non-Amp ACP agent, with read-only prompts.

## Acceptance criteria

- [ ] A real Pi child delegates, completes, reports its result and leaves no orphan.
- [ ] A real ACP provider child delegates, completes and reports provider/session evidence.
- [ ] The existing Amp native/Orb proof preserves the exact T-ID, executor and user attribution.
- [ ] Timeout, cancel and disconnect are observed without claiming remote cancellation when it is unknown.
- [ ] Anything temporary is cleaned up or archived, with evidence.

## Out of scope

Team-thread mutation, multiplayer changes, plugin deployment, automatic retries after ambiguous delivery.

## Evidence

Pending authorized smoke runs.
