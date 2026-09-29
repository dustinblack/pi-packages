---
status: ready
issue_id: "018"
tags: [pi-strings, amp, hub]
dependencies: []
---

# Open existing provider threads and coordinate Amp Orb work

## Where we are

trunk: 019 — replan unified create/open-existing support across agent integrations; no separate Amp extension or tool family
tangents: 020–024 — retain Amp proof gates but revise adapter placement/dependencies after 019

## Findings

- User requires all agent integrations to open existing provider-native threads/sessions as well as create new ones; rejects a separate Amp extension/tool family. Amp local/Orb is execution configuration, not a product boundary.
- [Superseded proposal and valid probe ledger](../pi-strings/docs/2026-09-29-AMP_PARTICIPANT_BOUNDARY.md): CLI exports full histories; one-shot plugin host exposes lookup but reports no user identity. Do not implement its rejected packaging recommendation.
- Evolve session admission and lifecycle deliberately; retain existing owned-worker behavior for owned work. Opening shared work must not silently grant cancellation, archive, executor, visibility, or multiplayer-management authority.
- No remote messages until an exact scratch Orb and message are approved. Never retry uncertain delivery automatically.

## Children

- [019](019-ready-amp-participant-boundary.md) — ready — redefine unified provider contract and native attachment capability matrix
- [020](020-ready-amp-readonly-participant.md) — ready — read-only native attachment
- [021](021-ready-amp-approved-contribution.md) — ready — authorized scratch contribution
- [022](022-ready-amp-multiplayer-recovery.md) — ready — concurrency, disconnect, permission evidence
- [023](023-pending-amp-plugin-bridge.md) — pending — only if native proof exposes a concrete gap
- [024](024-ready-amp-evidence-handoff.md) — ready — explicit provenance-preserving handoff

## Outcome

Every supported agent integration can create sessions and open existing provider-native threads through a unified interface. Amp participation additionally supports existing local/Orb work and approved coordination without taking over human-owned work.

## Context

User requested file-todos and matching session tracking, then corrected the architecture: extend the provider integrations rather than introduce another Amp tool family. The current children capture Amp-specific proof gates; 019 must add provider-wide delivery slices before implementation. File closure requires a user-approved closing commit on main; session progress is separate.

## Acceptance criteria

- [ ] 019 defines provider-wide create/open-existing acceptance and records each adapter gap without presenting unsupported attachment as delivered.
- [ ] 019–022 and 024, plus provider delivery slices defined by 019, close with evidence and commits on main.
- [ ] 023 is either explicitly approved and proven, or rejected with the native capability evidence that makes it unnecessary.
- [ ] Shared-thread activity, Pi operation state, and delivery evidence remain distinct; docs state all unproven limits.

## Out of scope

Space voice/video automation; workspace-admin enumeration; private HTTP APIs; permission escalation; autonomous cancellation; automatic file transfer.
