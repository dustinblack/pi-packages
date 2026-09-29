---
status: ready
issue_id: "003"
tags: [mom, pi-tether, cost, reliability]
dependencies: ["002"]
---

# Make a routine Mom update cost one call, with no retry storms

## Outcome

A routine Mom update costs one model call. A bad batch can never trigger repeated retries, and a failing update cannot block newer work.

## Context

Current rule (making-mom, 2026-09-29):
- Each update may make up to 5 Luna rounds, and no round is reserved for any purpose.
- Proposal, each repair, each search, each source read, and the final commit each consume a round.
- If nothing is accepted by round 5, the update fails and the cursor stays put, so the same evidence is retried at the next wake.
- The loop is `for (round < 5)` in `pi-tether/src/mother.ts`, with `parallel_tool_calls=false` and one operation per call.

Problems:
1. Every operation is a serial call that resends the full context, so each extra round costs another full input.
2. Validation errors are reported one at a time (open review P1: "unfinished errors remain serialized behind earlier defects"). Each defect costs a round.
3. After a failure, the same batch is retried at every wake, and it grows as new events arrive. [INFERENCE] This is the likely driver of the recurring "Mom couldn't update her notes" [4665][6337][6735].
4. Background updates can spend rounds on searches and source reads, even though the map may be eventually consistent [5895].

Governing rule: "don't double model usage, don't slow things down" [847].

Proposed failure rule, which the implementer may challenge with evidence: after 2 consecutive failures on the same cursor, advance past the range and record it as a visible gap. The session log remains the history.

## Acceptance criteria

- [ ] A background update (settled boundary or compaction) makes one proposal call, gets back all validation errors in one response, and makes at most one repair call
- [ ] Background updates cannot search or read sources; explicit questions keep their bounded search/read budget
- [ ] A failed update is not retried immediately; the next attempt waits for a later settled boundary with new material
- [ ] After 2 consecutive failures on the same cursor, the cursor advances and the skipped range appears as a gap in `/mom detail`; `/mom refresh` can catch up on it
- [ ] `/mom detail` shows session-level Mom calls, tokens, and nominal cost
- [ ] Tests assert call counts per path: routine = 1; rejected then repaired = 2; a failing batch uses at most 2 calls per boundary and becomes a gap after 2 failures
- [ ] pi-tether and pi-delegate checks pass

## Out of scope

- Changing models
- Kev screening (012)
