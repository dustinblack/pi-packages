---
status: ready
issue_id: "040"
tags: [pi-delegate, pi-strings, acpx, contract]
dependencies: ["039"]
forked_from: "039"
---

# Define the backend-neutral delegation contract

## Outcome

Specify the public delegate/delegate_ctl inputs, run identity, result shape, backend selector, and failure semantics shared by in-process Pi and ACPX workers.

## Context

`pi-delegate` currently owns `delegate`/`delegate_ctl`; `pi-strings` owns `op_*` worker/request records. The contract must preserve Pi defaults while allowing ACP agent, model, cwd, native session ID, executor hint, timeout, and delivery evidence.

## Acceptance criteria

- [ ] Contract covers create, open-existing, send, wait, result, steer, cancel, status, and close boundaries.
- [ ] Backend-specific fields are explicit and rejected when unsupported; no silent fallback from ACP to Pi.
- [ ] Run IDs, provider request IDs, native IDs, delivery, and remote outcome remain distinct.
- [ ] A short ADR or equivalent decision record names compatibility and lifecycle tradeoffs.
- [ ] Type-level or fixture tests prove the contract before backend implementation.

## Out of scope

Provider implementation, package wiring, real credentials, and Orb mutation.

## Evidence

Pending implementation.
