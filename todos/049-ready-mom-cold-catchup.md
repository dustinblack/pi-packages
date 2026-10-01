---
status: ready
issue_id: "049"
tags: [mom, pi-tether, catch-up]
dependencies: []
forked_from: "001"
supersedes: []
---

# Bootstrap Mom from a long session without per-slice model calls

## Outcome

When Mom has no usable checkpoint and the selected session has a large backlog, she builds a cited graph from the history without running one model proposal for each 24K-character feed capture.

## Context

The user directed an immediate fix after the 64 MB session was measured at 154 feed windows. Use `~/.agents/skills/thread-map/` for its normalization and compaction-boundary method; the raw session remains the evidence source. `24K` can remain a request-size guard but is not a model-work unit. The existing cursor and `.mom` sidecar remain authoritative; never claim coverage beyond evidence durably represented by the accepted checkpoint.

Making-mom owns the in-flight implementation: `pi-tether/src/bootstrap.ts`, `src/mother.ts`, `src/contract.ts`, `src/index.ts`, and `test/bootstrap.test.ts`. The cold path drains available history locally, segments at compaction boundaries, and gives Mom one bounded chapter-chain digest whose cut matches the drained evidence. The catch-up progress UI landed separately at `9d45ac8`.

## Acceptance criteria

- [x] The long-session bootstrap test drains many feed windows without one Mom proposal per window; failed proposals retain the prior checkpoint/cursor.
- [x] Read-only measurement on the actual long session reports feed windows, logical chapters, digest size, Mom/advisor calls, source coverage, and elapsed time; no live provider calls for measurement.
- [x] Chapter boundaries and source references are preserved; compaction summaries are not silently substituted for raw evidence.
- [ ] The saved checkpoint's cut exactly matches evidence represented by its digest; no gaps or overclaimed coverage — invariant holds in fixtures and is measured on the real session, but a full-suite green run is not yet recorded at the commit SHA.
- [ ] Bootstrap and current session tests/type checks pass at a stable SHA; evidence names the exact revision and command outcomes.

## Out of scope

- Ordinary live wake cadence (051), incremental graph-state/diff behavior (052), pi-intercom/pi-delegate product changes, compatibility migration, or changes to other owners' files.

## Evidence

## Evidence

- Implementation: `8e6ed0c` feat(tether): catch up a cold backlog in one bounded proposal (files: src/bootstrap.ts new, src/mother.ts cold-backlog branch + StagedBatch.digest, src/contract.ts one prompt sentence, src/index.ts three flags, test/bootstrap.test.ts new). Catch-up progress UI is the separate `9d45ac8`.
- Flags: `--mom-bootstrap` (default 1), `--mom-bootstrap-chapters` (24), `--mom-bootstrap-chars` (48000). The 24,000-character capture window is unchanged and remains the per-call context guard; bootstrap adds no advisor call and no per-turn screening.
- Tests: `test/bootstrap.test.ts` 4/4 at `8e6ed0c` — long backlog drains many windows with at most 2 model calls and 1 proposal; the explicit `maxChapters` policy stops the drain and reports `more=true` rather than claiming the remainder; segmentation and digest are deterministic with pointers; a single-window backlog keeps the ordinary path with 1 call.
- Full suite at `8e6ed0c`: pi-tether 144/145. The single failure is `test/extension.test.ts` "normal parent narrative updates Mom without bookkeeping" — a timing assertion, same pre-existing flake class todo 036 recorded under parallel load. Cause was mine: the first bootstrap test re-segmented the whole backlog per drain window (quadratic) and starved the parallel test file; fixed to count chapters incrementally, after which bootstrap tests are green. A clean 145/145 rerun is not yet recorded. pi-delegate: 71/71.
- Real-session measurement (read-only copy of the 62 MB making-Mom session, no live provider calls): 9,107 branch entries · 19 compactions → 20 host chapters · 8,851 feed events · 1,747,357 rendered evidence chars. Ordinary path: 73 capture windows → 73–146 model calls. Bootstrap: the same 73 windows drained locally with zero model calls; digest 19,245 chars of the 48,000 cap; 20/20 chapters; 95 distinct cited refs; 0 unresolved; coveredThroughRef `s0:8738fe38:b2`; model calls 1 proposal + at most 1 repair.
- Not yet done: a live capture of one real cold catch-up with a real Mom model on a fresh session.
