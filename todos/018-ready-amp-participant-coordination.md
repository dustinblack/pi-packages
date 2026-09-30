---
status: ready
issue_id: "018"
tags: [pi-strings, native-opening, amp, hub]
dependencies: []
---

# Open existing provider threads and coordinate Amp Orb work

## Where we are

trunk: 019 — unified contract/proof accepted by fresh review; closing commit awaits user approval; production unchanged
tangents: 020 common/Pi core, 026–029 primary providers, 030 remaining17 coverage; 021–024 Amp collaboration gates

## Findings

- User requires one `op_*` / ACPX interface for create and native open across all22 named integrations. Amp local/Orb is an execution option, not a separate product.
- [Current contract and matrix](../pi-strings/docs/NATIVE_SESSION_OPENING.md): ACPX already loads external IDs; Coordinator rejects them. Amp additionally requires an S-to-T adapter mapping today.
- Real isolated Pi 0.99.1 idle load found a synthetic native session without prior mapping. Recorded thinking survived; absent thinking gained a default entry. Not live-terminal attachment or proof for other providers.
- Preserve owned-worker behavior; opened work needs explicit identity/settings and lifecycle policy. Disconnect is not cancel. No remote contribution without an approved scratch target/message; no uncertain resend.

## Children

- [019](019-ready-amp-participant-boundary.md) — ready — contract, evidence, fresh architecture review
- [020](020-ready-amp-readonly-participant.md) — ready — common create/open + native Pi vertical slice
- [026](026-ready-codex-native-opening.md), [027](027-ready-claude-native-opening.md), [028](028-ready-opencode-native-opening.md) — ready — Codex, Claude, OpenCode delivery
- [029](029-ready-amp-native-opening.md) — ready — Amp local/Orb creation and native opening/observation
- [030](030-ready-remaining-native-provider-coverage.md) — ready — remaining17 capability investigation and provider delivery children; not delivery by itself
- [021](021-ready-amp-approved-contribution.md), [022](022-ready-amp-multiplayer-recovery.md) — ready — authorized contribution, multiplayer/recovery
- [023](023-pending-amp-plugin-bridge.md) — pending — only a demonstrated 029/022 gap plus explicit deployment approval
- [024](024-ready-amp-evidence-handoff.md) — ready — provenance-preserving handoff

## Outcome

Every supported agent integration creates sessions and opens existing provider-native threads through one interface. Amp additionally coordinates approved existing local/Orb work without taking over human-owned execution.

## Context

User approved provider-wide scope and delegated parallelism; rejected separate Amp packaging. File closure requires a user-approved closing commit on main; session progress is separate. The [old ADR](../pi-strings/docs/2026-09-29-AMP_PARTICIPANT_BOUNDARY.md) is superseded, but its probe ledger remains evidence.

## Acceptance criteria

- [ ] 019 closes with reviewed unified contract and all22 integrations accounted for.
- [ ] 020–022, 024, 026–030 and the provider children created by030 close with actual acceptance evidence and main-branch commits; an unsupported error is not provider delivery.
- [ ] 023 is explicitly approved/proven or rejected with evidence that a bridge is unnecessary.
- [ ] Shared activity, local request state, and delivery evidence remain distinct; user-facing docs state unproven limits.

## Out of scope

Space media automation, admin enumeration, private HTTP APIs, permission escalation, autonomous cancellation, automatic file transfer.
