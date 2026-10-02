---
status: ready
issue_id: "066"
tags: [mom, pi-tether]
dependencies: ["065"]
---

# Post-compact verification window watches the first settled turns

## Outcome

After a compaction, Mom checks each of the first settled lead turns — until the user's next message or three settled turns, whichever comes first — for continuity with pre-compact state, and corrects one misalignment visibly at the settled boundary.

## Context

- Settled design: `MOM-INTERFACE.md` §2 (repo root). The window is a bounded exception to the five-exchange batching (`cadence.ts`, scheduling in `index.ts`); scheduling still never wakes Mom mid-tool-stream or while a delegate runs.
- Sequencing: the existing compaction audit (`audit.ts`, `mother.ts`) runs first; the window watches the lead against the reconciled map. On audit failure, the window runs on the last accepted map.
- Stage one is deterministic code, free: the lead touches artifacts of folded-away or parked work, redoes something recorded done, contradicts a standing rule, or works toward a different goal than the current endeavor. Signals come from feed tool metadata (`feed.ts`) plus the graph's recorded artifacts and rules; no model call.
- Stage two is a small model, only on a stage-one flag: one bounded check — does this turn continue from pre-compact state, yes or no, cited — reusing the bounded page-plus-slice call shape from `mother.ts`.
- The correction rides todo 065's injection path: one message at the settled boundary, visible to the user, containing what the lead is doing, the pre-compact record (with sources), the current purpose, and the user's last direction. Never mid-stream, never a second correction in one window.
- Close conditions: the user's next message (a user pivot right after a compact is correct behavior and closes the window) or three settled turns. Continuity held → one widget line `continuity held after compact`, logged, otherwise silent.

## Acceptance criteria

- [x] A live capture shows a window opening after a compact, per-turn checks for its duration, and closure on the user's next message (or three settled turns)
- [x] A scripted misalignment — the lead redoes parked work — produces exactly one visible correction at the settled boundary with sources
- [x] A user pivot immediately post-compact is treated as correct behavior: the window closes, no correction is issued
- [x] Budget holds: at most three window checks per compaction, stage two only on a stage-one flag, at most one correction
- [x] Deterministic tests cover window open/close conditions, stage-one flags, budget caps, and the audit-failure fallback
- [x] `cd pi-tether && npm run check` passes

## Out of scope

- Stage-one watchers outside the window (open decision, `MOM-INTERFACE.md` §5)

## Evidence

- `cd pi-tether && npm run check` passed 2026-10-02: typecheck clean and 209/209 tests (196 before + 13 new window tests). The 066 slice adds `src/window.ts` and `test/window.test.ts`; `src/checkpoint.ts`, `src/mother.ts`, `src/index.ts`, and `test/fixture.ts` carry the window state, the bounded `windowCall`, the open/check/close wiring, and the test hooks. Three `test/anchor.test.ts` injection-ledger filters now exclude `kind === "window"` records — the window lifecycle legitimately interleaves the anchor ledger after every compaction, and its assertions' subject is anchor/notice ordering (the window records are window.test.ts's subject, asserted there).
- Live capture is loopback fidelity: the four live tests drive the real Pi runtime — real compaction path (including a mid-run compaction with the lead request gated at the provider), real `sessionManager.appendCustomEntry` file-op entries, real `sendMessage({triggerTurn: true})` agent runs that settle without an input event, real sidecar writes, and a session reload. The misalignment test's scripted map parks the flagged node as a **sibling under the root**, so the current line (focus + ancestors + focus descendants) excludes it and stage one flags the parked match; its correction lands as one visible branch entry (`display: true`) whose content matches the sidecar's `corrected` record verbatim, and neither a later prompt nor a reload produces a second.
- Budget and close conditions hold: each flagged turn spends one model check (`checks` 1→3), a fourth flagged turn after the three-turn close spends none, the user's next message closes the window with zero turns and zero window requests (a pivot is correct behavior, never corrected, silent in status), and the check request carries no tools with a strict JSON body keyed by the task marker — only a cited verdict among the offered refs counts; anything else records an error and corrects nothing.
- Flagged interpretations, all settled in code and tests: the correction itself closes the window (exactly one per compaction, the `corrected` field was dropped from the live window state because correction is structurally a close); a zero-turn close is silent while watched turns that stayed on the line end held (`continuity held after compact HH:MM`); checks run at settled boundaries regardless of running workers because they read lead events only; parked/settled/folded flags are never suppressed by a shared source page or by line overlap — over-inclusive by design, stage two adjudicates — while off-goal fires only when the whole turn stays outside the current line; the `checked` record is appended after the model call resolves so counts stay honest (a crash leaks at most one check's budget, accepted); bare status pings are queries, not direction, so they neither close the window nor pass as the last user direction.
- Forward-compat caveat: pre-0.1.5 builds (0.1.4) throw on `kind === "window"` sidecar records — an old build opening a session whose sidecar carries window records fails visibly rather than silently misreading; upgrading resolves it. No migration was added because the sidecar is per-session evidence, not a durable store.
- Not yet committed: the source, tests, README window section, `CHANGELOG.md` 0.1.5, and the 0.1.5 version bump are presented for approval together; the todos/ ledger rename for 066 is left for the ledger commit, not the pi-tether pathspec commit.
