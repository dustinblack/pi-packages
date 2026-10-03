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
- [x] Durable checkpoint cuts match the evidence represented by the accepted digest in fixtures, the frozen-copy replay, and the real-model capture. The 25 unavailable-worker gaps remain visible; the run does not claim complete branch coverage.
- [x] Bootstrap and current session tests/type checks pass at stable SHA `8473018`; `cd pi-tether && npm run check` passed typecheck and 158/158 tests on that commit.
- [x] Fresh-session real-model cold catch-up run and checkpoint cut verified on the selected session; evidence: `pi-tether/experiments/evidence/todo-049-live-cold-capture.json`.
- [ ] Semantic reconciliation passes. It currently fails: the graph claims an active malformed sidecar and leaves repair/pause proposed, but assistant line 9462 says there is no active sidecar and user line 9463 directs deletion of obsolete sessions. The graph also omits worker/tangent branches; 25 source gaps remain visible.

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
- Historical status before the 2026-10-01 live run: no real transcript checkpoint cut had been observed. Earlier `coveredThroughRef` values (`s0:8738fe38:b2`, later `s0:fdb974f8:b0`) were host-side block refs, not entry cuts. The live run below supersedes the absence-of-real-cut claim; it does not make the earlier fixture refs valid.
- (g) continuation freshness: pass 2 cites ZERO refs from before the pass-1 cut (verified per ref via branch index), is exactly one proposal, and asserts the target-overshoot bound explicitly; `maxChapters` is documented as a TARGET with reported `overshoot`, never called a maximum.
- INDEPENDENT VERIFICATION by mom-and-graphs (2026-10-01, no live model, local scripted HTTP fixture only), frozen copy of the supplied session at 65,762,902 bytes / 9,265 branch entries: **157 capture windows → 2 fixture proposals total** (140 windows then 17), 0 real provider calls, 25 missing-worker gaps visible in state, final cut resolves to the branch leaf, no unresolved graph citations, `more=false`. This verifies bounded scheduling and cursor behavior against the real transcript shape, not semantic map quality; the fixture deliberately emits one synthetic node. The old continuation would have spent 157 proposals here.
- Fresh-session live capture completed 2026-10-01; see the evidence file below. It proves a real provider checkpoint and bounded calls, but the semantic review found a stale sidecar-state claim, so map quality remains an open acceptance item.
- File-level handoff (2026-10-01): making-mom explicitly released `mother.ts`, `bootstrap.ts`, and `test/bootstrap.test.ts`; the only 049 `index.ts` hunk was the one-line `mom-bootstrap-chapters` description, and the bounded-backlog prompt phrase was absorbed into 052's contract rewrite. The separate narrowing sentence remains assigned to 038. The integrated changes are committed at `8473018`.

## Real-model capture (2026-10-01)

- Source SHA-256 `a712252d49abc109ab8b308f2b17e3109443ec551f3a9cb24230adba462dbadc`, 66,250,829 bytes. Source and isolated copy hashes were unchanged after the run.
- Two bounded update passes; three actual Mom provider calls (two including one repair in pass 1, one in pass 2), zero Kev calls, 22,160 input + 2,644 output + 11,904 cached-input tokens, $0.00784288 nominal, 55.1 seconds cumulative model time.
- Durable checkpoint `ea520040-39a2-4a3a-82a5-0dc51763a480`; both pass cuts matched the observed evidence cut; `more=false`; no model failure; 25 unavailable-worker feed gaps remained visible, zero durable gap records.
- Five nodes: purpose root, active catch-up, two active user rules, and one proposed repair/pause choice. The choice contradicts the latest evidence: assistant line 9462 says no active sidecar exists and identifies only an archived obsolete-layout file; user line 9463 says to delete obsolete sessions. The output still says a live malformed sidecar exists and leaves a repair/re-enable decision open. Worker/tangent branches were not represented. This is a semantic failure, not just a coverage caveat.
- The evidence verifies bounded real-model catch-up and a durable cut. It does **not** pass the semantic-quality acceptance item. No prompt/model tuning or pi-delegate work was done.
