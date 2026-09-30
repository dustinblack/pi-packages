---
status: ready
issue_id: "020"
tags: [pi-strings, native-opening, pi]
dependencies: ["019"]
forked_from: "018"
---

# Create and open native Pi sessions through the existing tools

## Outcome

The common `op_*` interface creates owned workers and opens an independently created native Pi session without treating it as owned work. Other adapters reuse this contract.

## Context

Implement [the unified contract](../pi-strings/docs/NATIVE_SESSION_OPENING.md), not the superseded separate Amp participant proposal. ACPX already loads exact external IDs; Coordinator admission, owned-worker launch defaults, persistence, prompt decoration, and cancellation policy are the barriers. The vendored Pi adapter already finds native sessions absent its mapping. The real Pi 0.99.1 experiment preserved recorded thinking but appended a default when none was recorded; load is not universally read-only.

## Acceptance criteria

- [ ] `op_spawn` creates when native `sessionId` is absent and opens that exact native session when supplied; migrate the public `resumeSessionId` callers/docs/tests without compatibility aliases.
- [ ] Origin, scoped native identity, ACP identity, verified workspace/settings, and actual capabilities survive persistence/restart. Version-1 owned records migrate explicitly without broadening authority; ambiguous or corrupt records fail visibly.
- [ ] Open/reconnect does not replay creation profile settings, worker tools/model/mode, or WORKER_CONTRACT. Unknown IDs, mismatched identity/workspace, duplicate binding, and missing capabilities fail without creating/forking/latest fallback.
- [ ] Opened lifecycle distinguishes local request outcome from native activity, explicit stop from disconnect, and stored-session resume from live-client attachment. No automatic resend, model fallback, cancel-on-timeout, archive, or deletion of opened work. Active local executor limitations are enforced and reported rather than hidden.
- [ ] Bounded observations expose enough native history/state to verify the target without injecting full transcripts. Existing owned-worker behavior and tests remain intact.
- [ ] New-contract regressions and `npm run check` pass. Actual `op_*` smoke creates a scratch session independently, opens/continues that same Pi ID, preserves recorded settings/workspace, rejects unknown ID without creating, and proves supported disconnect/cancel semantics. Record tested Pi/adapter versions; synthetic idle load alone is insufficient.

## Out of scope

Provider-specific gaps belong to 026–030; Amp live collaboration belongs to 021–024/029. Never claim simultaneous attachment to an already-running native Pi executor from stored-session loading. No arbitrary user session mutation; live inference uses an authorized scratch session.

## Evidence

Pending; starts after 019 closes on main. `scripts/probe-native-pi-opening.mjs` is prior isolated idle-load evidence, not delivery of this tool path.
