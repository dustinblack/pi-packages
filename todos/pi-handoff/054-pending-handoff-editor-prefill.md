---
status: pending
issue_id: "054"
tags: [pi-handoff, bug]
dependencies: []
---

# Prefill the editor after /handoff on current Pi

## Outcome

After `/handoff`, the new session opens with the handoff prompt in the editor, as the extension intends.

## Context

- `pi-handoff/extensions/handoff.ts` listens for `session_switch`, which Pi removed in 0.65. In real Pi the handler never fires, so the editor stays empty. This predates the 0.99 migration (`dd4e7f6`).
- Renaming the event to `session_start` is not enough: `ctx.newSession()` rebuilds the extension runtime, so the in-memory `pendingHandoffText` map is lost. Use the `newSession({ withSession })` callback instead.
- `tests/handoff.test.ts` fires `session_switch` handlers by hand, which is why it passes.
- The same family of pre-existing type problems shows up in the `session-query.ts` copies in pi-handoff, pi-huddle and pi-compaxxt: `label` is a function where Pi expects a string, and tool results lack `details`.

## Acceptance criteria

- [ ] On Pi 0.99, `/handoff` opens a new session whose editor contains the generated prompt.
- [ ] The test drives the real session-replacement path, not a hand-fired `session_switch`.
- [ ] `session-query.ts` passes a string `label` in all three packages.

## Out of scope

Other pre-existing type warnings in pi-web-access and pi-huddle.

## Evidence

Found by the Pi 0.99 migration agent on 2026-09-30.
