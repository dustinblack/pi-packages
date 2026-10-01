---
status: pending
issue_id: "060"
tags: [pi-delegate, acpx, security, permissions]
dependencies: []
---

# Confine ACP writer workers to their worktree

## Outcome

An ACP worker with `role: "writer"` can change files only inside its assigned worktree, for every agent that delegate offers as a writer. Agents that cannot be confined are documented as such and refused, or flagged, as writers.

## Context

Rescued from the deleted `pi-strings/tasks/todo.md` (commit `0238492`; read it with `git show 0238492^:pi-strings/tasks/todo.md`).
- **Codex:** codex-acp marks the session project `trusted`, so Codex's Guardian approves `apply_patch` outside the worktree. The planned fix:
  - vendor codex-acp at a pinned commit;
  - add a `build:codex-acp` step and override the `codex` agent;
  - patch `createSessionConfig` `trust_level`;
  - re-run the "real Codex writer permission boundary" E2E;
  - record the diff in `vendor/codex-acp/README.md`.

  The existing test's "must be rejected" claim overstates what the thin proxy guarantees.
- **Amp:** it can be confined with a user rule `reject apply_patch`, but scoping to the worktree by regex is fragile because Amp emits absolute paths. amp-acp does not forward per-session permission rules, so the "real Amp writer permission boundary" E2E fails under the default policy.
- **Claude:** Write/Edit go through ACP `session/request_permission`, so a path-scoped ACPX permission decision could confine it. Noted direction: a scoped pre_tool_use hook or permissions, with a post-turn reconcile as backstop.
- First step is to decide scope with the user: a trust fix, ACP-routed approval, or both.

## Acceptance criteria

- [ ] For each writer-capable agent, a real E2E proves a write outside the worktree is rejected, or the agent is refused as a writer with a stated reason.
- [ ] `docs/ACP_TEST_COVERAGE.md` states each agent's boundary honestly.

## Out of scope

Read-only workers; the read-only policy already relies on ACPX `approve-reads`.

## Evidence

Filed 2026-09-30 from pi-strings' task list at retirement.
