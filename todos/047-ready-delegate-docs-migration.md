---
status: ready
issue_id: "047"
tags: [pi-delegate, pi-strings, docs, migration]
dependencies: ["042", "043"]
forked_from: "039"
---

# Document the unified delegation surface

## Outcome

Users can install, select, and operate Pi or ACPX delegation without learning the low-level `op_*` protocol for ordinary tasks.

## Context

The current pi-strings README teaches direct coordinator tools; pi-delegate teaches `delegate`/`delegate_ctl`. Documentation must state when to choose Pi versus ACPX, how native Amp opening differs, and which controls remain provider-specific.

## Acceptance criteria

- [ ] README and agent guide show natural-language delegate examples for both backends.
- [ ] Migration notes explain direct `op_*` compatibility and the new front door.
- [ ] Backend-specific authority, identity, timeout, delivery, and cancellation limits are explicit.
- [ ] Examples match schemas and pass docs/resource path checks.

## Out of scope

Changing provider capabilities or claiming plugin author identity.

## Evidence

Pending implementation.
