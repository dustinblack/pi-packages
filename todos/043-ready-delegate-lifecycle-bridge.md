---
status: ready
issue_id: "043"
tags: [pi-delegate, pi-strings, lifecycle]
dependencies: ["040", "041", "042"]
forked_from: "039"
---

# Map delegation lifecycle controls across backends

## Outcome

Make wait, result, status, steer, cancel, and close behave consistently at the delegate front door while preserving backend-specific evidence and authority.

## Context

Pi children support durable run segments and revival. ACPX workers support provider requests, native sessions, explicit delivery, and bounded cleanup. A unified status must not turn remote acceptance into completion or local disconnect into remote cancellation.

## Acceptance criteria

- [ ] `delegate_ctl` maps each supported action to the selected backend.
- [ ] Wait/result preserve provider request IDs, native IDs, delivery, output bounds, and terminal causes.
- [ ] Steer/cancel are explicit capability checks; unsupported ACP steering fails rather than falling back.
- [ ] Close/disconnect never implicitly cancels externally owned native work.
- [ ] Cross-backend lifecycle tests cover success, timeout, provider failure, ambiguity, and cancellation.

## Out of scope

New provider APIs, multiplayer controls, and UI redesign.

## Evidence

Pending implementation.
