---
status: ready
issue_id: "041"
tags: [pi-delegate, pi-strings, acpx, backend]
dependencies: ["040"]
forked_from: "039"
---

# Implement the ACPX delegation backend

## Outcome

Run an ACPX/provider worker behind the backend-neutral delegation contract by reusing pi-strings' Coordinator and AcpxRuntimePort rather than creating a second runtime.

## Context

The existing Coordinator already owns provider sessions, persistence, permission policy, deadlines, retries, native identity, and request evidence. The backend must adapt those records to delegate-compatible results without duplicating lifecycle logic.

## Acceptance criteria

- [ ] ACPX backend creates and tracks external provider workers through the existing Coordinator.
- [ ] Backend returns a delegate run ID plus provider request/session/native IDs.
- [ ] Provider failure, timeout, cancellation, and ambiguous delivery remain non-success states.
- [ ] ACPX workers cannot recursively invoke delegation tools.
- [ ] Unit tests cover fake Pi ACP and at least one non-Pi ACP agent fixture.

## Out of scope

Changing provider adapters, native Amp open semantics, or pi-delegate UI rendering.

## Evidence

Pending implementation.
