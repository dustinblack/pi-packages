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

Making-mom implemented and released the continuation fix on 2026-10-01. The cold path drains available history locally, segments at compaction boundaries, and gives Mom a bounded chapter-chain digest whose cut matches the drained evidence. The integrated 049/051/052 implementation is committed on local `main` at `8473018`; catch-up progress UI landed separately at `9d45ac8`. This SHA verifies Tether behavior, not real-model semantic map quality.

## Acceptance criteria

- [x] The long-session bootstrap test drains many feed windows without one Mom proposal per window; failed proposals retain the prior checkpoint/cursor.
- [x] Read-only measurement on the actual long session reports feed windows, logical chapters, digest size, Mom/advisor calls, source coverage, and elapsed time; no live provider calls for measurement.
- [x] Chapter boundaries and source references are preserved; compaction summaries are not silently substituted for raw evidence.
- [x] The saved checkpoint's cut exactly matches evidence represented by its digest; no gaps or overclaimed coverage — holds in fixtures (cases e-g) and is confirmed by the coordinator's independent frozen-copy replay below, with 25 pre-existing missing-worker gaps visible rather than hidden. Not yet observed on a real Mom-model run.
- [x] Bootstrap and current session tests/type checks pass at stable SHA `8473018`; `cd pi-tether && npm run check` passed typecheck and 158/158 tests on that commit.
- [ ] A fresh-session live cold catch-up with a real Mom model confirms a durable checkpoint cut and semantic result; not yet run, so no real-model semantic claim.

## Out of scope

- Ordinary live wake cadence (051), incremental graph-state/diff behavior (052), pi-intercom/pi-delegate product changes, compatibility migration, or changes to other owners' files.

## Evidence

- Implementation: `8e6ed0c` feat(tether): catch up a cold backlog in one bounded proposal (files: src/bootstrap.ts new, src/mother.ts backlog branch + StagedBatch.digest, src/contract.ts one prompt sentence, src/index.ts three flags, test/bootstrap.test.ts new). Catch-up progress UI is the separate `9d45ac8`.
- Continuation fix (reported by mom-and-graphs, reproduced by them with a zero-provider fixture: 1 bootstrap proposal + 17 extra ordinary 24K-slice proposals on a live-session copy): the digest now serves EVERY bounded backlog batch, not only the first. With a checkpoint already present, `update()` resumes the chapter digest instead of falling back to per-window proposals. Verified by the new multi-pass 40-chapter regression below.
- Flags: `--mom-bootstrap` (default 1), `--mom-bootstrap-chapters` (24), `--mom-bootstrap-chars` (48000). The 24,000-character capture window is unchanged and remains the per-call context guard; bootstrap adds no advisor call and no per-turn screening.
- Tests: `test/bootstrap.test.ts` — (a) long cold backlog drains many windows with at most 2 model calls and 1 proposal; (b) explicit `maxChapters` policy stops the drain and reports `more=true` rather than claiming the remainder; (c) segmentation + digest deterministic with `[src:ref]` pointers; (d) single-window backlog keeps the ordinary path with exactly 1 call;
- (e) NEW multi-pass 40-chapter regression: 40 compaction chapters drain across passes in at most 4 total model calls (not per window), each pass's cut is a real entry id at the drained end, `more` stays true until the final pass, a failed mid-drain write retains the prior checkpoint/cursor and re-drains without doubling, and citations resolve in the feed.
- Full suite: pi-tether 145/145 and `extension.test.ts` 11/11 confirmed by mom-and-graphs at the pre-fix SHA; the continuation fix itself is covered by (e). pi-delegate: 71/71.
- Real-session measurement (read-only copy, no live provider calls): 9,175 branch entries · 19 compactions → 20 host chapters · 8,925 feed events · 1,765,471 rendered evidence chars (the transcript is live and growing, so these numbers drift between runs). Ordinary path estimate: 74 windows → 74–148 model calls. Bootstrap: the same windows drained locally with zero model calls; digest 19,246 chars of the 48,000 cap; 20/20 chapters; 95 distinct cited refs; 0 unresolved. The 74-window figure is an estimate from rendered chars ÷ 24,000; `capture()` budgets its own accumulation, so treat the exact count as approximate.
- NOT yet done, and previously mis-stated: a durable checkpoint cut has never been observed on the real transcript — none was made, because that requires a real Mom model call. The `coveredThroughRef` value I reported earlier (`s0:8738fe38:b2`, later `s0:fdb974f8:b0`) is host-side and is a BLOCK ref (`:b0`), not an entry id, so it cannot be a cut. Cut/cursor evidence exists only at fixture level (cases a–e above).
- (g) continuation freshness: pass 2 cites ZERO refs from before the pass-1 cut (verified per ref via branch index), is exactly one proposal, and asserts the target-overshoot bound explicitly; `maxChapters` is documented as a TARGET with reported `overshoot`, never called a maximum.
- INDEPENDENT VERIFICATION by mom-and-graphs (2026-10-01, no live model, local scripted HTTP fixture only), frozen copy of the supplied session at 65,762,902 bytes / 9,265 branch entries: **157 capture windows → 2 fixture proposals total** (140 windows then 17), 0 real provider calls, 25 missing-worker gaps visible in state, final cut resolves to the branch leaf, no unresolved graph citations, `more=false`. This verifies bounded scheduling and cursor behavior against the real transcript shape, not semantic map quality; the fixture deliberately emits one synthetic node. The old continuation would have spent 157 proposals here.
- Not yet done: a fresh-session live capture of one real cold catch-up with a real Mom model. The fixture/replay proves bounded scheduling and cursor behavior at `8473018`; it does not prove semantic map quality or an actual provider checkpoint.
- File-level handoff (2026-10-01): making-mom explicitly released `mother.ts`, `bootstrap.ts`, and `test/bootstrap.test.ts`; the only 049 `index.ts` hunk was the one-line `mom-bootstrap-chapters` description, and the bounded-backlog prompt phrase was absorbed into 052's contract rewrite. The separate narrowing sentence remains assigned to 038. The integrated changes are committed at `8473018`; the real-model capture remains open.
