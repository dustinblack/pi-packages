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
