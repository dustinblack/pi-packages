---
status: ready
issue_id: "047"
tags: [pi-delegate, docs, migration]
dependencies: ["042", "043"]
forked_from: "039"
---

# Document the unified delegation surface

## Outcome

Users install pi-delegate and run Pi or ACP delegation from `delegate`, without learning the old `op_*` protocol.

## Context

pi-strings' README, `docs/AGENT_GUIDE.md` and `skills/pi-strings` teach the `op_*` tools. pi-delegate's README and `skills/delegation` teach `delegate`/`delegate_ctl`. Merge them into pi-delegate's docs and skill. Keep the Amp and native-session design docs (`docs/NATIVE_SESSION_OPENING.md`, `AMP_*`) under `pi-delegate/docs/`.

## Acceptance criteria

- [ ] The README and delegation skill show natural-language `delegate` examples for both backends.
- [ ] A migration note maps each old `op_*` call to its `delegate` equivalent, using 040's table.
- [ ] Backend-specific authority, identity, timeout, delivery and cancellation limits are stated.
- [ ] Examples match the schemas, and docs/resource path checks pass.

## Out of scope

Changing provider capabilities; claiming plugin author identity.

## Evidence

Pending implementation.
