---
status: ready
issue_id: "020"
tags: [pi-strings, amp]
dependencies: ["019"]
forked_from: "018"
---

# Observe an exact existing Orb without taking ownership

## Outcome

Pi discovers accessible threads, binds one exact native identity, reads bounded observations, and detaches locally without changing remote work.

## Context

Implement only the reviewed contract from 019. Reuse existing CLI authentication, not workspace-admin credentials. `T-...` is native identity, not an ACP `S-...` session. Initial empty or disconnected activity snapshots are not idle evidence.

## Acceptance criteria

- [ ] Exact service/account/thread scope is verified; invalid, inaccessible, changed-account, or non-Orb targets fail honestly without fallback to latest.
- [ ] State/history outputs and process lifetime are bounded; limits and unavailable fields are explicit, no full transcript leaks into logs or model context.
- [ ] Detach, timeout, shutdown, and reload affect only Pi's passive local resources; no prompt, executor attachment, cancel, archive, visibility, or multiplayer calls.
- [ ] New-contract tests and existing package checks pass; actual selected-Orb read/observe/detach smoke records exact ID preservation and remote non-mutation evidence.

## Out of scope

Sending and management controls. A real existing Orb selected for the probe is required before claiming this live gate passed. No persistent transcript archive or always-on bridge.

## Evidence

Pending; work starts after 019 closes on main.
