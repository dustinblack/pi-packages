---
status: ready
issue_id: "021"
tags: [pi-strings, amp]
dependencies: ["020"]
forked_from: "018"
---

# Contribute one approved message to the same existing Orb

## Outcome

Pi sends an authorized, visibly attributed contribution to a selected remote thread and reports only the delivery/result evidence actually observed.

## Context

Native exact-ID Orb continuation is documented but not live-proven here. Use fixed executable/argv and stdin, preserve remote settings, never decorate with WORKER_CONTRACT. User approval must name the scratch Orb and message before the first send.

## Acceptance criteria

- [ ] One unique approved `[Pi coordinator]` message appears exactly once in the selected scratch Orb, with CLI and web evidence of identity and unchanged executor/settings.
- [ ] Local operation, acceptance evidence, and remote activity are distinct; `is_error` cannot become success through exit code alone.
- [ ] Ambiguous transport delivery is unknown, never automatically resent; local abort is not reported as remote cancellation.
- [ ] Pi's own sends are serialized without claiming a human lock, separate authenticated bot identity, or unproven response correlation.
- [ ] New-contract tests, existing checks, and actual remote smoke pass with bounded retained output.

## Out of scope

Any unapproved team-thread message; permission changes; automated retry; busy-thread correlation claims (022); implicit steering or cancellation.

## Evidence

Pending; blocked on 020 closure plus target/message authorization.
