---
status: complete
issue_id: "014"
tags: [mom, pi-tether, ui]
dependencies: ["006"]
---

# The user can switch to a Mom view and talk to her directly

## Outcome

The user can switch to a Mom view and talk to her directly, the way they switch to a pi-delegate agent, without `/mom` commands.

## Context

- "Make a todo to make it so we can switch to the dedicated mom view and even interact directly adhoc with that agent without /mom commands. Similar to how pi-delegate works… Lower in pri than the other items" [6940].
- Prior art: pi-delegate's agent switching (the Ctrl+J Agents key).

## Acceptance criteria

- [x] Switching into the Mom view and back works
- [x] An ad hoc question is answered from the map
- [x] Returning to the lead leaves its context untouched
- [x] A test covers the switch and the return

## Evidence

- Main implementation: `58ac5a0` (worker commit `4214e5f`). `Alt+T` opens Mom; `Esc` or `Alt+T` returns. `Ctrl+X` cancels an answer.
- On main: `cd pi-tether && npm run check` passed 112 tests; `cd pi-delegate && npm run check` passed 40 tests.
- `cd pi-tether && npx tsx test/terminal-mom-proof.ts` drove the actual fullscreen Pi TUI in an isolated tmux terminal. Switch, map-backed answer, and return passed. The local loopback provider tests UI integration, not real-model answer quality.
- Lead transcript SHA-256 before and after: `d44c1bfb9471c612153d9e1fdcc802991223d901352f4232db501e489a468700` (combined 011/widget-fix rerun; original closure capture is preserved in `9331977`). Lead draft `LEAD-DRAFT-014` survived; Mom Q&A was absent from that transcript.
- Terminal captures and hash receipt: `pi-tether/experiments/evidence/todo-014/`.
