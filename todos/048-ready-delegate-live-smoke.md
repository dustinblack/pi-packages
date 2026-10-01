---
status: ready
issue_id: "048"
tags: [pi-delegate, pi-strings, acpx, smoke]
dependencies: ["046", "047"]
forked_from: "039"

---

# Prove unified delegation on real Pi and ACP providers

## Outcome

Exercise the installed unified surface end to end: one ordinary Pi child and one authorized ACP/provider child, including the existing Amp Orb/native path where credentials permit.

## Context

Fixtures cannot prove process boundaries, provider identity, native executor preservation, or user-facing attribution. Keep prompts read-only and use approved scratch/existing targets only.

## Acceptance criteria

- [ ] Real Pi child delegates, completes, reports result, and leaves no orphan.
- [ ] Real ACP provider child delegates, completes, and reports provider/session evidence.
- [ ] Existing Amp native/Orb proof preserves exact T-ID, executor, and user attribution.
- [ ] Timeout/cancel/disconnect behavior is observed without claiming remote cancellation when unknown.
- [ ] Temporary sessions, credentials, and test threads are cleaned or archived with evidence.

## Out of scope

Team-thread mutation, multiplayer changes, plugin deployment, and automatic retries after ambiguous delivery.

## Evidence

Pending authorized smoke runs.
