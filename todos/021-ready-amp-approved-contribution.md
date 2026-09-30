---
status: ready
issue_id: "021"
tags: [pi-strings, amp]
dependencies: ["029"]
forked_from: "018"
---

# Contribute one approved message to the same existing Orb

## Outcome

Pi sends an authorized, visibly attributed contribution to a selected remote thread and reports only the delivery/result evidence actually observed.

## Context

Native exact-ID Orb continuation is documented but not live-proven here. Use the common `op_send` through the Amp adapter/ACPX path proven in 029, not a parallel CLI coordinator. Preserve remote settings; never decorate opened work with WORKER_CONTRACT. User approval must name the scratch Orb and message before the first send.

## Acceptance criteria

- [ ] One unique approved `[Pi coordinator]` message appears exactly once in the selected scratch Orb, with CLI and web evidence of identity and unchanged executor/settings.
- [ ] Local operation, acceptance evidence, and remote activity are distinct; `is_error` cannot become success through exit code alone.
- [ ] Ambiguous transport delivery is unknown, never automatically resent; local abort is not reported as remote cancellation.
- [ ] Pi's own sends are serialized without claiming a human lock, separate authenticated bot identity, or unproven response correlation.
- [ ] New-contract tests, existing checks, and actual remote smoke pass with bounded retained output.

## Out of scope

Any unapproved team-thread message; permission changes; automated retry; busy-thread correlation claims (022); implicit steering or cancellation.

## Evidence

The user explicitly authorized target `T-01a0f0b4-5330-714f-a024-0a156279b832` and marker `[Pi coordinator scratch probe] Exact-ID contribution test — no action required.`. After a read-only identity check, the common `op_spawn`/`op_send`/`op_wait`/`op_result`/`op_close` path sent exactly one request: `req_8e2e67a5-c766-4e05-83f9-e29700bf5b15`. It completed with `delivery: accepted`, `providerOutcome: completed`, one attempt, and no decoration; Amp returned `Received. This probe message needs no action, so I'm doing nothing with it.` No retry or cancellation occurred.

A subsequent read-only export found exactly one occurrence at message index 10, message ID `11`, protocol message ID `M-034XcLszXd82PjgLtXorn2`, with executor metadata `sandbox` and mode `medium`. The target was closed through the provider-neutral disconnect path. This is evidence for one approved contribution, but 021 remains blocked in the planner until 029's native-opening gates are closed and does not claim busy multiplayer attribution.
