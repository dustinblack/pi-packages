---
status: ready
issue_id: "027"
tags: [pi-strings, native-opening, claude]
dependencies: ["020"]
forked_from: "018"
---

# Open and continue an existing native Claude session

## Outcome

Claude creation and native-session opening both work through the common `op_*` tools without creating a replacement conversation.

## Context

[Unified contract and pinned sources](../pi-strings/docs/NATIVE_SESSION_OPENING.md). Published claude-agent-acp 0.60.0 supplies SDK `resume: sessionId`; changing cwd/MCP fingerprint tears down the query. A supplied resume ID alone does not prove the SDK rejects unknown IDs or preserves native settings. Provider-specific fixes belong in the adapter/ACPX path.

## Acceptance criteria

- [ ] Independently create a scratch native Claude session, then open/read/continue its exact ID through `op_*` without coordinator provenance or an existing live adapter query.
- [ ] Prove unknown IDs fail without creating/forking. Verify actual native identity rather than trusting an echoed requested ID; scope it to the relevant account/storage context.
- [ ] Preserve original workspace/model/permission policy across open/reconnect; no creation profile/MCP override silently recreates the query with different authority.
- [ ] Demonstrate disconnect and explicit cancel separately; document/enforce concurrent local executor limits and ambiguous-delivery behavior.
- [ ] Versioned adapter fixes if needed, new-contract regressions, package checks, and actual authorized scratch smoke pass with bounded evidence.

## Out of scope

Arbitrary active user sessions, unapproved inference, or policy changes. SDK source inspection is not live acceptance.

## Evidence

Pending; starts after 020 closes on main.
