---
status: ready
issue_id: "022"
tags: [pi-strings, amp, concurrency]
dependencies: ["021"]
forked_from: "018"
---

# Preserve attribution and shared work through multiplayer races

## Outcome

Pi remains a safe participant while another authorized person contributes and while Pi disconnects or restarts.

## Context

A thread becoming idle or returning its last assistant message is not per-message completion. Native send receipts, busy-thread queueing, cross-user permission, and interrupted-stream effects require live proof, not inferred SDK guarantees.

## Acceptance criteria

- [ ] Controlled second-contributor experiment distinguishes each input and correlated output; unresolved lineage is reported unknown.
- [ ] Observer detach/restart does not cancel remote work; ambiguous send recovery never duplicates a message.
- [ ] Changed/expired contribution permission fails closed without broadening visibility or answering human-only approvals.
- [ ] Deterministic regressions cover proven behavior, and recorded real multiplayer evidence covers what fixtures cannot.
- [ ] Record whether a concrete capability gap requires 023; do not deploy a bridge merely because an API exists.

## Out of scope

Requires an owner-approved scratch thread and a second authorized participant before cross-user acceptance. No destructive fault injection against active team work, private API, or remote stop without separate approval.

## Evidence

Pending; work starts after 021 closes on main and participants are available.
