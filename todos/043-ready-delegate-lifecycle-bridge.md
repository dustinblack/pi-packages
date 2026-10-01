---
status: ready
issue_id: "043"
tags: [pi-delegate, acpx, lifecycle]
dependencies: ["042"]
forked_from: "039"
---

# Map delegation lifecycle controls across backends

## Outcome

`delegate_ctl` wait, result, status, steer, cancel and close behave consistently for both backends and keep backend-specific evidence and authority.

## Context

Pi children support durable run segments and revival. ACP workers support provider requests, native sessions, explicit delivery and bounded cleanup. A unified status must not turn remote acceptance into completion, or a local disconnect into remote cancellation. Follow 040's `op_*` mapping table for observe/append/cancel_remote/close.

## Acceptance criteria

- [ ] Each `delegate_ctl` action maps to the run's backend.
- [ ] Wait/result preserve request IDs, native IDs, delivery, output bounds and terminal causes.
- [ ] Steer and cancel check capabilities explicitly; unsupported ACP steering fails instead of falling back.
- [ ] Close/disconnect never implicitly cancels externally owned native work.
- [ ] Lifecycle tests cover success, timeout, provider failure, ambiguous delivery and cancellation on `acp`.

## Out of scope

New provider APIs, multiplayer controls, UI redesign.

## Evidence

Pending implementation.
