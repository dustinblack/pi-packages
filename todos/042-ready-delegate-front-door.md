---
status: ready
issue_id: "042"
tags: [pi-delegate, delegation, dispatch]
dependencies: ["040"]
forked_from: "039"
---

# Dispatch pi-delegate through Pi or ACPX backends

## Outcome

Make `delegate` the normal user-facing entry point while preserving current in-process Pi behavior and adding explicit ACPX/provider selection.

## Context

The pi-delegate extension currently assumes an in-process Pi child. Its run log, role resolution, model approval, and Agents frame must remain intact for the default backend. ACPX selection must be explicit and visible.

## Acceptance criteria

- [ ] Existing `delegate` calls with no backend preserve current Pi behavior.
- [ ] A caller can select ACPX plus provider/agent, model, cwd, timeout, and task.
- [ ] Tool descriptions and output expose backend and session evidence without leaking low-level implementation noise.
- [ ] Unknown backend/provider and unsupported fields fail explicitly.
- [ ] No `delegate`/`delegate_ctl` schema collision occurs when pi-strings resources are loaded.

## Out of scope

Lifecycle implementation, native Amp semantics, package version changes, and deleting `op_*` tools.

## Evidence

Pending implementation.
