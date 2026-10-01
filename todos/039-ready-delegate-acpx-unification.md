---
status: ready
issue_id: "039"
tags: [pi-delegate, pi-strings, acpx, architecture, hub]
dependencies: []
forked_from: ""
---

# Unify delegation across Pi and ACPX backends

## Where we are

trunk: 039 — approved architecture; contract and work slices are ready
tangents: native Amp plugin deployment → separate 031 gate; do not block the delegation migration

## Findings

- `pi-delegate` is the high-level `delegate`/`delegate_ctl` UX around in-process `createAgentSession` children.
- `pi-strings` is a low-level ACPX control plane with external provider sessions, native IDs, Orb/local execution, and `op_*` tools.
- The approved direction is one delegate front door with `pi` and `acp` backends; ACP children remain external sessions.
- Current package peer ranges are incompatible on paper: pi-delegate requires Pi >=0.86.1 while pi-strings declares >=0.83.0 <0.84.0. Compatibility must be verified, not assumed.

## Children / execution graph

- 040 — ready — define backend-neutral delegation contract and adapter seam
- 041 — ready — implement ACPX backend over the existing pi-strings Coordinator
- 042 — ready — dispatch pi-delegate's delegate tools through selectable backends
- 045 — ready — align package versions and install both packages together
- 043 — ready — map wait/steer/cancel/status/receipts across both backends; depends on 040–042
- 044 — ready — preserve native Amp/Orb session opening through the ACP backend; depends on 041, 043
- 046 — ready — add cross-backend contract/install tests; depends on 042–045
- 047 — ready — document migration and user-facing delegation; depends on 042–043
- 048 — ready — run real Pi and authorized ACP/Amp smoke proofs; depends on 046–047

040, 041, 042, and 045 can proceed in parallel after the contract slice. 043 and 044 follow the runtime seams; 046–048 are gates.

## Outcome

A Pi user invokes one delegate-like surface. The system runs ordinary Pi children in-process or ACPX/provider children externally, with honest backend-specific lifecycle and result evidence.

## Context

Preserve pi-delegate's durable child runs, roles, model selection, steering, cancellation, and run logs. Preserve pi-strings' ACPX permissions, provider adapters, native session identity, Orb/local execution, bounded requests, and no-recursive-orchestration policy. Do not make ACP children pretend to be in-process Pi sessions.

## Acceptance criteria

- [ ] A documented backend-neutral contract selects `pi` or `acp` without changing the default Pi behavior.
- [ ] ACPX-backed delegation returns delegate-compatible run IDs/results and maps lifecycle controls without losing provider evidence.
- [ ] Existing Amp native `T-...` opening and Orb/local settings remain exact and explicit.
- [ ] Both packages load together on the supported Pi range with no tool/schema collisions.
- [ ] Contract tests, install smoke, and authorized real-provider smoke pass.
- [ ] Normal users no longer need low-level `op_*` calls for ordinary delegation.

## Out of scope

Amp visibility/multiplayer administration, plugin author identity, replacing ACPX, silently converting external sessions into Pi child sessions, or deleting direct low-level controls before migration evidence exists.

## Evidence

The user approved this architecture on 2026-09-30: extend pi-delegate with pi-strings/ACPX provider backends. Hindsight initiative: `kp-064d029437dd4bc385e63d3656e3c6d1`.
