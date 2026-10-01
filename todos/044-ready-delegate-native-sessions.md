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

Pending. Prior native Amp evidence is in todos 029 and 021.
