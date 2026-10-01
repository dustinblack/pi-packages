---
status: ready
issue_id: "044"
tags: [pi-delegate, acpx, amp, native-opening]
dependencies: ["043"]
forked_from: "039"
---

# Preserve native Amp and provider session opening through delegate

## Outcome

`delegate` can create Amp local/Orb sessions and open exact native `T-…` sessions without replay, ownership takeover or settings drift.

## Context

The moved Coordinator already verifies native identity, account scope, cwd, executor, model and disconnect policy (`docs/NATIVE_SESSION_OPENING.md`, `test/acp/native-amp.test.ts` after 041). The delegate adapter exposes these without treating an opened provider thread as an ordinary Pi child. Native sends stay undecorated and user-attributed. That property was proven through `op_send` and must now hold through the delegate path.

## Acceptance criteria

- [ ] New ACP Amp runs select local or Orb execution explicitly.
- [ ] Existing native IDs open only with verified identity and settings, plus explicit executor hints where required.
- [ ] Native sends through `delegate_ctl` stay undecorated and user-attributed.
- [ ] Closing or disconnecting an opened run does not archive, delete or cancel it.
- [ ] Fixture tests from `native-amp.test.ts` pass through the delegate surface.

## Out of scope

Plugin deployment, visibility/multiplayer administration, custom author identity. Real Orb proof belongs to 048.

## Evidence

Closing commit `16dd624`. Validated in a clean worktree with real npm: typecheck clean; 260 tests, 241 pass, 0 fail, 19 skipped; `check:install` PASS (153 files).
- Observation is opt-in: `status`/`result` with `observe: true` and one runId. Each call makes one `amp threads export` and returns only messages after a persisted cursor (`messageId`, `v`, `updatedAt`), bounded by `maxOutputBytes`. A failed export is `unknown` and the cursor doesn't move. Nothing polls in the background.
- Creating an Amp session requires `executionEnvironment`.
- Native open, undecorated steer and close/park without archive/delete/cancel are tested in `test/acp-native.test.ts`.
- Per-message author is always `unknown`: the export has no author field.
- Prior native Amp evidence: todos 029 and 021.
- Code-review findings on this slice (#7: an over-bound first message loses its tail) are being fixed separately. Prior native Amp evidence is in todos 029 and 021.
