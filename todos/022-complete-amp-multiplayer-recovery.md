---
status: complete
issue_id: "022"
tags: [pi-strings, amp, concurrency]
dependencies: ["021"]
forked_from: "018"
---

# Close multiplayer attribution as provider-owned scope

## Outcome

Multiplayer participant identity, presence, queueing, and cross-user attribution are explicitly treated as Amp-owned behavior, not a pi-strings acceptance gate.

## Context

The common tooling must bind the exact native thread, send the approved prompt once, preserve provider IDs, and report local delivery/provider outcome. It must not reimplement or certify Amp's participant roster, human presence, or remote response attribution.

## Acceptance criteria

- [x] Scope decision recorded: do not build a second participant/attribution layer in pi-strings.
- [x] Existing pi-strings behavior remains conservative: no automatic resend, remote cancellation, archive, or inferred shared completion.
- [x] Any provider metadata returned by Amp remains opaque evidence; missing identity is not synthesized.

## Out of scope

Live second-participant experiments, provider presence/roster validation, busy-thread lineage certification, and plugin deployment for those concerns. No destructive fault injection or remote stop.

## Evidence

The user explicitly rejected multiplayer validation as a pi-strings requirement: participant identity and concurrent Orb behavior are functions of Amp. A read-only export of `T-01a0e96b-ca73-72bc-bf80-af444d9b2afe` showed historical device streams for Scott and Aaron, but the adapter does not promote that into a fabricated live participant contract. The common path already records exact native thread IDs, local request IDs, `delivery`, and `providerOutcome`; it does not retry or claim remote completion.

Closed by user-approved scope decision in commit `PENDING_COMMIT`.
