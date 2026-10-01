---
status: ready
issue_id: "028"
tags: [pi-strings, native-opening, opencode]
dependencies: ["020"]
forked_from: "018"
---

# Open and continue an existing native OpenCode session

## Outcome

OpenCode creation and native-session opening use the common `op_*` interface while preserving the existing session's model, variant, mode, and workspace.

## Context

[Unified contract and pinned sources](../pi-delegate/docs/NATIVE_SESSION_OPENING.md). OpenCode 1.18.33 load/resume calls `session.get` for the exact ID before restoring session configuration; resume reads 20 messages, load full history. MCP registration and active-turn/disconnect semantics still need live proof. The registry currently resolves an unpinned command.

## Acceptance criteria

- [ ] Independently create a scratch native session, then open/read/continue the same ID through `op_*`, without an old coordinator handle.
- [ ] Preserve native workspace/model/variant/mode and permissions on open/reconnect; do not replay creation settings or silently change MCP configuration.
- [ ] Unknown IDs reject without create/fork/fallback; history exposure is bounded, actual identity verified, and deployed version recorded.
- [ ] Verify active-session behavior, disconnect versus explicit cancel, and ambiguous delivery without automatic resend; no unsupported takeover claim.
- [ ] Required adapter fixes, new-contract regressions, package checks, and authorized real scratch smoke pass.

## Out of scope

Arbitrary active user sessions or unapproved inference. Static handler evidence alone does not satisfy acceptance.

## Evidence

Pending; starts after 020 closes on main.
