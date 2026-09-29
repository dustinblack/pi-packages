---
status: pending
issue_id: "023"
tags: [pi-strings, amp, decision, conditional]
dependencies: ["022"]
forked_from: "018"
---

# Resolve a proven coordination gap with the least plugin authority

## Outcome

A specific missing native capability is either supplied by a narrowly scoped Amp plugin bridge or explicitly rejected as unnecessary.

## Context

Plugin state/history APIs, steering, and lifecycle message IDs exist, but host placement and cross-thread wake/permission semantics are unproven. A native client cannot import a plugin API into a live connection. Webhooks are capability secrets with at-least-once, unordered delivery, not completion receipts.

## Acceptance criteria

- [ ] 022 identifies the exact unmet capability; user approves the bridge design before implementation/deployment, or records rejection supported by native proof.
- [ ] If approved: specify host, authenticated callers, target allowlist, lifecycle/disposal, bounded data flow, and idempotency/unknown-delivery handling.
- [ ] Prove only required state/steering/correlation behavior in scratch Orb; permission expiry fails closed and human approvals remain human-only.
- [ ] Security review, new-contract tests, and actual deployed-path smoke pass before claiming bridge delivery.

## Out of scope

Deferred until 022's live experiment demonstrates a concrete gap and user promotes this item. No permanent service, webhook, or plugin installation beforehand; no guessed internal APIs.

## Evidence

Pending; conditional work is not authorized by filing this plan.
