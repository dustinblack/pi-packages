---
status: ready
issue_id: "044"
tags: [pi-delegate, pi-strings, amp, native-opening]
dependencies: ["041", "043"]
forked_from: "039"
---

# Preserve native Amp and provider session opening through delegation

## Outcome

Allow the unified delegate surface to create Amp local/Orb sessions and open exact native `T-...` sessions without replay, ownership takeover, or settings drift.

## Context

pi-strings already verifies native identity, account scope, cwd, executor, model, and disconnect policy. The delegate adapter must expose these capabilities without treating an opened provider thread as an ordinary Pi child.

## Acceptance criteria

- [ ] New ACP Amp workers select explicit local/orb execution.
- [ ] Existing native IDs open only with verified identity/settings and explicit executor hints where required.
- [ ] Native sends remain undecorated and user-attributed through `op_send`.
- [ ] Opened close/disconnect does not archive, delete, or implicitly cancel.
- [ ] Real existing Orb and local proofs pass with exact IDs and preserved settings.

## Out of scope

Plugin deployment, visibility/multiplayer administration, and custom author identity.

## Evidence

Pending migration proof; prior native Amp evidence is recorded in todos 029 and 021.
