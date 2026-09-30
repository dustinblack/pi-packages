---
status: complete
issue_id: "012"
tags: [mom, pi-tether, kev, cost]
dependencies: ["003"]
---

# With Kev configured, Mom wakes only when the work actually moved

## Outcome

With Kev configured, a cheap check decides whether a user message or settled turn moved the work at all. Mom wakes only when it did.

## Context

- "Kev should screen user messages, don't always wake mom" [5827].
- "why aren't we doing more of a binary 'have things deviated from our current map?' and then let the mom model do the depth?" [5953]
- Kev is cheap and good at probabilities [5550], but optional [5103]. Status quo is the default [5811].
- Endpoint: `http://192.168.1.52:9999/v1/systemone` (LAN; the advisor code already has a loopback/RFC1918 guard).
- `advisor.ts` currently reviews a drafted update. This todo is screening before Mom wakes.

## Acceptance criteria

- [x] Kev unconfigured → behavior unchanged (test)
- [x] Kev configured → a turn screened as "no movement" makes zero Mom calls (test)
- [x] On the 008 replays, report how many wakes were avoided and how often real movement was missed; misses caught later are acceptable (eventually consistent)

## Evidence

- Main implementation: `a228576` (branch commit `dda03c5`), fresh reviewer verdict **ship** after a P1 fix. The P1: the correction-bypass flag cleared before its batch was consumed; fixed by marking user-command corrections `correction: true` on the FeedEvent and deriving the bypass from the staged batch, so it survives worker deferral, pause/resume, reset, and reload.
- `cd pi-tether && npm run check` on main: 137/137 (one earlier parallel-run timing flake in `graph-runtime.test.ts` passed alone and on rerun). `cd pi-delegate && npm run check`: 40/40.
- Unconfigured behavior: `test/mother.test.ts` "without a configured advisor every settled update behaves exactly as before". No-movement zero Mom calls: "a no-movement screen accepts the batch as unchanged state with zero Mom model calls", including durable cold reopen and separate screen-usage stream. Bypasses, fail-open receipts, abort/stale, and failed-cursor-write retention are covered.
- 008 replay report (`pi-tether/experiments/evidence/todo-012/`): at the shipped default `0.25`, 11/30 sampled routine wakes avoided; 15/15 preregistered gold movement windows kept; 3/24 material preserved-update proposals skipped (eventual-consistency risk, not proven caught later). Threshold `0.70` was measured and rejected: it skipped 14/15 gold movements. Full segment screening timed out on the local endpoint; the routine number is a 30-event sample.
- Residual risk: calibration and evaluation reuse the same captured scores; classifier false negatives remain possible. Screening is opt-in (empty URL disables it).
- The screen runs before Mom's model lookup; unavailable/malformed/timeout fails open; a failed cursor write retains the batch instead of treating storage failure as a classifier verdict.
