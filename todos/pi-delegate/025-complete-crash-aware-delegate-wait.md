---
status: complete
issue_id: "025"
tags: [pi-delegate, reliability, monitoring]
dependencies: ["017"]
---

# A waiting agent detects crashed delegates instead of blocking blindly

## Outcome

A blocked `delegate_ctl wait` returns a precise crash report when the child stops without ever reporting completion, instead of sitting blind until the run budget expires.

## Context

- User direction (in-session, 2026-09-29): "We also need a way for an agent to periodically monitor for crashed delegates, instead of just blind waits."
- Most failure paths settle correctly: launch errors settle (`src/index.ts:232-234`), `finishRun` sets status then settles (`:805-822`), the timeout path marks status and aborts (`:887`).
- The hole: paths that set a terminal status without settling — most visibly `:1092`, where a child-state save failure sets `status = "error"` and only calls `session.abort()`, so completion arrives only if the abort callback still fires. If it does not, `RunCompletion` never settles and the wait is blind for the whole run budget.
- Observable fact, no heuristics on content: **`run.status !== "running"` while `run.completion.settled === false`**, sustained across two consecutive 1s polls (two polls exist because `finishRun` may sit in an async persistence step between the status write and the settle).
- Wait already polls at 1s for queued messages (017, `0efe7f8`); crash detection rides the same interval — no new timers.
- Related facts, not this todo: `delegate_ctl status` already gives an agent a non-blocking health read; healthy long waits should use it. Run-budget timeouts remain the backstop.

## Acceptance criteria

- [ ] Test: a run whose status flips to a terminal value without settling makes `wait` return within ~2 polls with the status and recorded error text, marked `isError: true`, while the child is neither cancelled nor settled by the wake
- [ ] Test: the transient status-settle gap of a normal completion does not false-positive (the two-poll guard), and a run woken by the crash report still settles afterward — a terminal status is preserved, not laundered into complete
- [ ] Test: queued-message wake (017) and crash wake coexist: message wake stays a normal result, crash wake is an error result
- [ ] The wait description states both wake conditions
- [ ] pi-delegate checks pass; pi-tether checks unaffected

## Out of scope

- Heartbeats for healthy waits — `delegate_ctl status` covers periodic monitoring; request separately if wanted
- Any pi-intercom edit (user directive: no pi-intercom edits)
- Changing run budgets or timeout behavior

## Evidence

- Feature commit: `901e392` (`feat(pi-delegate): report crashed children from blocking waits (todo 025)`), pushed to main.
- Validation: `cd pi-delegate && npm run check` — typecheck + **40/40 tests**, including the new crash test (coexistence: queued-message wake stays isError:false even with a terminal status; two-poll crash report carries status + recorded error as isError:true; the woken run still settles afterward with its terminal status preserved, not laundered). `cd pi-tether && npm run check` — **111/111**, unaffected.
- Detection rides the existing 1s wait poll; two consecutive terminal-status-without-settle polls trigger the report (the guard that rides out finishRun's async persistence gap). No new timers, no busy-wait, no content heuristics — the fact is status/state only.
- Known blind spots, stated: heartbeats for healthy long waits are out of scope (delegate_ctl status covers periodic monitoring); run-budget timeouts remain the backstop; no pi-intercom edit was made or attempted (user directive).
