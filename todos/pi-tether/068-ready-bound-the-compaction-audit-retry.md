---
status: ready
issue_id: "068"
tags: [mom, pi-tether]
dependencies: ["066"]
---

# Bounded compaction-audit retry retires a twice-failed audit

## Outcome

A compaction-audit update that fails twice — the compaction-triggered run plus one sticky retry — retires the audit for the session: later updates are regular incremental ones over raw evidence, so a compaction whose claims cannot be grounded in raw evidence can never re-run a doomed audit on every settled update or latch Mom's widget as permanently stopped.

## Context

- Live failure (2026-10-01 session `01a0f835`, sidecar): after a 23:25 compaction, the audit failed on every settled update for hours — 23:27 (verdict rejected), 23:49 (verdict rejected), 00:58 (audit passed but the proposal failed on unfinished disposition), 01:02 (verdict rejected) — each failure re-latched `error` (`update stopped` · "Mom couldn't update her notes"; last saved map 7h 50m old in the widget). `pendingAudit` cleared only on full success (`mother.ts` 174–175, 439), so every failure kind — rejected verdict or failed proposal — re-ran the full reconstruction on the next update, forever.
- The existing design gives the audit one cross-update retry (`incremental.test.ts`: "a later retry repeats the audit before accepting the raw-grounded correction") — a reconstruction that grounds its claims in raw evidence on a later pass still gets that chance. The cap preserves it: attempt 1 = the compaction-triggered run, attempt 2 = the one sticky retry.
- Any failure inside the compaction-audit update counts (verdict rejection, proposal defect, provider failure): the live session showed both the verdict and the proposal doom loops. A superseded update (session/branch change) counts for nothing.
- The counter is in-memory, like `pendingAudit` itself (never serialized; a reload already drops a pending audit). Retirement is final for the session: the compaction summary stays a claim, later updates integrate raw evidence, and each failure remains recorded in the sidecar usage ledger that `/mom detail` shows.

## Acceptance criteria

- [x] A twice-failed audit makes no third audit request: the next update is a regular incremental one that accepts a raw-grounded transaction, advances the cursor, and clears the latched error
- [x] The one cross-update retry stays available: the second attempt still re-runs the audit, and the existing contradicted-summary test passes unchanged
- [x] A success on the retry still clears the pending audit as before
- [x] `cd pi-tether && npm run check` passes

## Out of scope

- The audit's summary-only citation rule firing on discrepancy/open-question items that are themselves claims about the compaction summary (observed in the same live session) — filed as 069.
- The widget's double `after compact HH:MM` segments (anchor delivered + window closed at the same minute) — two distinct facts rendered separately; cosmetic.
- Updates during a continuous multi-hour lead turn: Mom updates only at settled boundaries by settled design.

## Evidence

- `cd pi-tether && npm run check` passed 2026-10-02: typecheck clean and 210/210 tests (209 before + the new retirement regression). The 068 slice adds one test in `test/incremental.test.ts` ("a twice-failed compaction audit retires; later updates resume as regular raw-grounded ones") and the counter in `src/mother.ts` (`auditAttempts`, reset when a fresh review arrives at update entry, incremented in `update()`'s catch, retiring `pendingAudit` at two). `src/audit.ts` is untouched: any failure inside a compaction-audit update counts, matching both observed live doom loops (the rejected verdicts at 23:27/23:49/01:02 and the failed proposal at 00:58).
- The regression test proves the fix both ways: on unfixed code it fails exactly as the live session did — the third `mom.update()` re-runs the doomed audit and rejects (`audit.ts:92` → `mother.ts:320`). With the fix, attempt one rejects after its repair round (2 audit requests), the sticky retry rejects again (4 total), and the third update makes no audit request, accepts a raw-grounded `commit_graph` transaction, advances the cursor, publishes a new snapshot, and clears the latched error.
- The one-retry intent is preserved unchanged: the existing "a contradicted compaction summary cannot ground a record" test passes unmodified — its later retry re-runs the audit and accepts the raw-grounded correction, and a success on the retry still clears the pending audit as before.
- README's audit paragraph and `CHANGELOG.md` 0.1.6 state the bound; `package.json` bumps 0.1.5 → 0.1.6. The 069 pending todo files the same session's citation-rule discovery (summary-only rejections on honest discrepancy items) referenced from Out of scope.
- Live-session impact (2026-10-01 `01a0f835`, unmodified): with this fix the 23:49 second rejection would have retired the audit, and the ~00:58 settled update would have been a regular incremental one over raw evidence instead of a third full audit run.
