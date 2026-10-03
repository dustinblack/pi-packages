---
status: complete
issue_id: "015"
tags: [mom, pi-tether, cost, acceptance]
dependencies: ["003", "005", "006"]
---

# Mom's model usage on a realistic session stays below the lead's

## Outcome

On a realistic live session, Mom's model usage is measured per call and stays below the lead's, so she does not double usage.

## Context

- "we don't necessarily want to double or more the model usage with this Mom approach, nor do we want to slow things down" [847].
- Earlier: 787 Mom calls and $2.02 in one session under per-event waking [6766].
- The cause of the cache gap was never proven.
- Earlier single-case measurements are not comparable to a full session.

## Acceptance criteria

- [x] Usage is recorded per reply over one real multi-hour session, or over the 008 replays run at live cadence
- [x] Mom's total tokens and nominal cost are below the lead's
- [x] The cache share is reported
- [x] If Mom exceeds the lead, a follow-up todo names the measured driver (not applicable: Mom is below)

## Evidence

- Implementation: `d512be8` (experiment harness `pi-tether/experiments/cost-replay.ts` plus artifacts in `pi-tether/experiments/evidence/todo-015/`).
- 33m22s live-cadence replay of the three preserved 008 bundles through production Mom: 92 wakes, 132 Luna replies (79 accepted, 7 deterministic failures, 6 no-op wakes), one update per production wake with 15s start-to-start cadence and greedy 24,000-character capture.
- Per reply recorded for both sides. Mom: 690,426 input + 82,961 output tokens, 778,112 cache reads, **$0.2532** nominal, cache share **52.99%**. Lead: 102,175,945 input + 617,452 output, 82,762,092 cache reads, **$37.3901**, cache share 44.75%. Workers separately: 44 replies, $0.6175.
- Mom is **0.68% of the lead's nominal cost** and fresh input. Worst-case sensitivity with every cache-read token billed as fresh input: **$0.4088**, still 1.1% of the lead. Mom's cache share is reported; the historical unexplained cache gap does not reappear.
- Lead per-reply usage was extracted from the bundles' source JSONLs by feed-id matching, cross-checked against `metrics.json actorUsage` (ssmp within 0.01%; pi/buzz deltas = worker streams plus non-event-producing replies). Independent recomputation from `mom-replies.jsonl` and `lead-replies.json` matches `run.json` exactly.
- Deviations and residual risk are recorded in `pi-tether/experiments/evidence/todo-015/README.md` (idle gaps not slept — cache share is an upper bound; compaction review payloads not replayed; worker-settle proxy; lead stream only for the head-to-head figure).

## Findings

- Read-only inventory on 2026-09-30 of `~/.pi/agent/sessions/*/*.mom` found one sidecar: the making-Mom session. It spans 18.11 hours but contains the obsolete `control`/`attempt`/`checkpoint` layout (1/101/65 records), not the current `map`/`notice`/`usage` runtime. This is historical evidence, not current-runtime cost acceptance.
- The committed 006 capture records two settled turns and two Mom calls; it does not meet this todo's multi-hour or live-cadence replay criterion.
- Required evidence is still a current-runtime multi-hour session with per-reply lead and Mom usage, or a completed live-cadence replay. No new replay was started for this inventory; no session or sidecar was changed.
