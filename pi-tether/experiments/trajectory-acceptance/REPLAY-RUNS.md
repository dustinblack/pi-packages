# Aligned horizon replay — attempt log (todo 008, V2)

All artifacts live under `/private/tmp/todo-008-trajectory/`. No raw transcript text is committed.

## Attempt 1 — 2026-09-29, `private-v2-cancelled-20260929`

Eight Luna calls in 4 minutes; 4 of the 10 needed after-maps produced. Killed by a single `WebSocket error` on `buzz-conflict-01`: the harness treated any non-deterministic error as fatal, and the run aborted with `aligned update did not finish cleanly`.

## Attempt 2 — 2026-09-30, `private-v2-attempt2-20260930`

Killed at `pi-pivot-01` with `gap/failure remains` after 2 calls. Two problems found:
1. `deterministic-retry` called `update()` with `refresh=false`, which returns early when a retained failed range has no newer material — production's own wait-for-next-boundary semantics. The retry never ran.
2. The scorer packet paired a **v1 before-map** with a **replay after-map** — two different trajectories. The protocol's "snapshot immediately before the case's registered boundary" means the replay's own state.

## Attempt 3 — 2026-09-30, final (`aligned-replay-manifest.json`)

Harness changes, made before any scoring and with no change to prompts, settings, cases, labels, thresholds, or scorer packets' content rules:
1. Transport-only failures retry the same staged evidence up to 3 times (5 s apart).
2. A retained deterministic failure is retried through the explicit refresh path — the same range, exactly as production's gap/refresh mechanics do; a second failure opens one gap that refresh then repairs.
3. Two aligned phases per case: consume evidence up to `boundary-1`, snapshot the replay's own before-map, then consume `boundary..horizon` and snapshot the after-map. Before and after now share one lineage. The registered v1 before-map remains the eligibility record; the manifest's `beforeLineage`/`registeredBeforeMatches` fields record the distinction. Result: 0 of 10 replayed before-maps match the registered v1 before-maps, as expected for an independent current-prompt lineage.
4. Caps raised from 30 calls / 12 min to 60 calls / 40 min after attempt 1 died near the old budget.

Result: 31 Luna calls, 10 repairs, 0 unresolved gaps, 15/15 cases with before+after maps, 11m43s. Scorer packet `semantic-scorer-packet.json`, sha256 `fa5b0e99f7e485a51eaf88cbe4469014c80e47b6b15ce6090a045ee77af726aa`.

## Scoring run log — 2026-09-30 (blind semantic scoring)

Two failures of my own harness had to be fixed before any score was valid. Both are recorded because they shaped the raw evidence:

1. **Missing routing header.** The first scoring pass dispatched `opencode-go` calls without `options.sessionId`, and pi-ai only injects the required `x-opencode-session` header from it. Both `opencode-go` models returned `MissingSessionID` for all 30+ calls. Fixed by passing `sessionId: todo-008-<slot>-<caseId>`.
2. **Reasoning starvation.** With the header fixed, the adjudicator (`glm-5.3`) spent its whole 3000-token budget on reasoning tokens and returned no visible text (`stopReason: length`, empty content). Fixed by raising the budget to 12000 and disabling reasoning for `opencode-go` calls (measured ~3 s vs multi-minute). Three adjudications had already succeeded under the default setting before this change; the four final adjudications (case-006, 013, 014, 015) and every re-run used reasoning disabled. First-round scorer A and B results are unchanged from their original calls.

## Result — `semantic-score.json`

`status: fail`, **3/15**, zero critical-gate violations, zero unresolved acceptance gaps.

| | accept | expand | contract | redirect | reorganize |
|---|---|---|---|---|---|
| Gold | 5 | 1 | 4 | 3 | 2 |
| Blind | 2 | 7 | 2 | 4 | 0 |

Blind scorers agreed with each other on 12/15 movements (3 decided by the sealed adjudicator), so the pair is internally consistent, but they label "expand" roughly 7× more often than the gold set and under-apply contract/accept by the same amount. The preregistered gate is a strict label match, so the result is a **fail** — and the distribution shift says the two scorer sets do not share movement semantics. Read it as a measurement finding first, not as proof that Mom's maps are wrong.
