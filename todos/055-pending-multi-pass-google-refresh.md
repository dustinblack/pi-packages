---
status: pending
issue_id: "055"
tags: [pi-multi-pass, bug]
dependencies: []
---

# Stop pi-multi-pass crashing when a Google token expires

## Outcome

Refreshing an expired Google Cloud or Antigravity credential in pi-multi-pass either works or fails with a clear message, instead of throwing a ReferenceError.

## Context

- `pi-multi-pass/extensions/multi-sub.ts:847-848` calls `refreshGoogleCloudToken`, `refreshAntigravityToken` and `GeminiCredentials`. None of these is defined or imported anywhere, and none has been since the package was vendored. Pi 0.99.1 has no gemini-cli or Antigravity OAuth to import them from.
- `handlePoolChainList(ctx)` and `handlePoolChainStatus(ctx)` (lines ~5496 and ~5505) are called without their `poolManager` argument.
- Found by the Pi 0.99 migration (`38bc404`); both predate it. Tests pass 10/10 because none of them reaches these paths.

## Acceptance criteria

- [ ] Expired Google credentials refresh through a real implementation, or report "refresh unsupported" explicitly.
- [ ] Pool-chain list and status receive their `poolManager`.
- [ ] A test covers each path.

## Out of scope

Other ad-hoc type errors in the file.

## Evidence

Found by the Pi 0.99 migration agent on 2026-09-30.
