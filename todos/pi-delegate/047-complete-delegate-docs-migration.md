---
status: complete
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

- [x] The README and delegation skill show natural-language `delegate` examples for both backends.
- [x] A migration note maps each old `op_*` call to its `delegate` equivalent, using 040's table.
- [x] Backend-specific authority, identity, timeout, delivery and cancellation limits are stated.
- [x] Examples match the schemas, and docs/resource path checks pass.

## Out of scope

Changing provider capabilities; claiming plugin author identity.

## Evidence

Closing commit `854a9b6`.
- The agent checked all 38 JSON examples against the schemas and `validateStartInput`/`validateSteer`, plus 44 relative links and 34 file paths.
- Observation docs were corrected to `observe: true` after 044 landed.
- The skill description had to be quoted: its colon broke YAML, and Pi silently stopped loading the skill. Caught by `check:install`, which now passes (152 files).
