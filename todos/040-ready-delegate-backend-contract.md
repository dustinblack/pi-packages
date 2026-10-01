---
status: ready
issue_id: "040"
tags: [pi-delegate, acpx, contract]
dependencies: ["039"]
forked_from: "039"
---

# Define the backend-neutral delegation contract

## Outcome

One written contract for `delegate`/`delegate_ctl` inputs, run identity, result shape, backend selector and failure semantics, shared by in-process Pi and ACP workers. It also decides what happens to each of the 12 `op_*` capabilities.

## Context

- `pi-delegate/src/index.ts`: `Run` record (~69–133), `delegate` (~1176–1315), `delegate_ctl` status|result|wait|steer|cancel (~1336–1512). The `pi` backend is the current behavior.
- pi-strings (moving in under 041): `domain/types.ts` `RuntimeHandle` (backend/runtime/session/native IDs), `RequestRecord` (request ID, status, delivery, provider outcome), `AmpControlRecord`; `orchestration/coordinator.ts` serialized `execute` seam with spawn/send/wait/result/cancel/close.
- `op_*` today: spawn, status, send, observe, append, steer, cancel_remote, wait, result, list, cancel, close. Each one maps to a `delegate`/`delegate_ctl` field or action, or is dropped with a reason. No `op_*` tool survives as a tool (053).
- One package, one Coordinator, so there is no cross-package lookup or lock question.

## Acceptance criteria

- [ ] Contract covers create, open-existing (`sessionId`), send/steer, wait, result, status, cancel and close for both backends.
- [ ] ACP-only fields (agent, sessionId, executionEnvironment) are explicit and rejected on `pi`. There is no silent fallback from ACP to Pi.
- [ ] Run ID, provider request IDs, native ID, delivery and remote outcome stay distinct in the result shape.
- [ ] A table maps each of the 12 `op_*` tools to its new home or to "dropped" with a reason.
- [ ] A short ADR names the lifecycle and compatibility tradeoffs.
- [ ] Type-level or fixture tests pin the contract before backend wiring.

## Out of scope

Moving code (041), provider implementation, real credentials, Orb mutation.

## Evidence

Pending implementation.
