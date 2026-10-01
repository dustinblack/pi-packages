---
status: ready
issue_id: "049"
tags: [mom, pi-tether, catch-up, bootstrap]
dependencies: []
---

# Cold catch-up costs one bounded proposal, not one per capture window

## Outcome

A long cold backlog becomes a useful map after bounded work. Mom reads the whole backlog locally (no model calls), and spends **one bounded model proposal** — plus at most one repair — on a host-built chapter-chain compression. The 24,000-character capture window stays what it is: a per-call context guard, not a schedule.

## Context

- Measured on the real 62 MB making-Mom session: 9,107 branch entries, 19 compactions (20 chapters), 1,747,357 rendered evidence characters. The ordinary path would spend one proposal per window: **73 windows → 73–146 model calls**, serialized at the wake interval.
- The thread-map skill (`~/.agents/skills/thread-map/`) supplies the design: normalize first, segment on compaction boundaries, extract state with raw pointers, treat compaction summaries as claims, map-reduce instead of one giant prompt.
- The host performs no semantic judgment: it emits recorded lead directions with source pointers, one line per chapter, and marks compaction summaries as claims. Mom synthesizes the map.

## Acceptance criteria

- [x] A long cold backlog is caught up by ONE bounded proposal, not one per capture window (test: `bootstrap.test.ts`)
- [x] The digest on real data is bounded and every cited ref resolves (measured: 19,245 chars of a 48,000 cap, 20/20 chapters, 95 refs, 0 unresolved)
- [x] Coverage never exceeds processed evidence; unprocessed remainder is reported as pending, not claimed
- [x] Source citations resolve in the feed; checkpoint/cursor survive cold reopen without replaying processed evidence
- [x] An explicit bounded policy exists (chapters, digest chars, window safety net) and is configurable
- [x] Ordinary live-update behavior is unchanged when a backlog fits one window
- [ ] Live capture of one real cold catch-up on a fresh session with a real Mom model

## Guardrails

- No second history ledger: the digest feeds Mom's existing graph and sidecar, nothing else.
- No per-update cadence redesign here; that is todo 051.
- The advisor is not involved in bootstrap and no per-turn screening call is added.

## Out of scope

- Ordinary update cadence, wake scheduling, advisor screening (todos 050–052).
- Map-quality label studies (todo 037).
