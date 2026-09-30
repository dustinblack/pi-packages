# Todo 015 — Mom cost acceptance (live-cadence replay)

Production Mom replayed over the three preserved todo-008 bundles at production wake and cadence rules, with per-reply usage recorded for both sides. No scoring inputs were touched; this is a cost-only run. Provider calls are real (`openai-codex/gpt-5.6-luna`, flat-rate subscription; nominal cost from the catalog).

## Result (run 2026-09-30, 33m22s)

| | Replies | Input | Output | Cache read | Nominal cost | Cache share |
|---|---:|---:|---:|---:|---:|---:|
| **Mom** | 132 | 690,426 | 82,961 | 778,112 | **$0.2532** | 52.99% |
| **Lead** | 1,204 | 102,175,945 | 617,452 | 82,762,092 | **$37.3901** | 44.75% |
| Lead + workers | 1,248 | 102,396,960 | 630,111 | 83,170,284 | $38.0076 | 44.81% |

Mom is **0.68% of the lead's nominal cost** and **0.68% of its fresh input**. Worst-case sensitivity (every Mom cache-read token billed as fresh input): **$0.4088 — still 1.1% of the lead**. Mom's cache share is reported above; the historical unexplained cache gap does not reappear in this configuration.

All four checks pass: Mom below lead on tokens, on billable tokens, on cost, and under the worst-case bound; cache share reported for both sides.

## Method

`pi-tether/experiments/cost-replay.ts` imports production `Mom` and runs one update per production wake:

- **Wake rule**: settled lead turn (assistant `stop`), delegate settle (worker-final `stop` proxy plus extracted receipts), or compaction. Settles within 15 s of the previous update start coalesce; compaction reviews run immediately. Trailing events with no settle are dropped, matching a session that never wakes again.
- **Cadence**: every update start is ≥15 s after the previous start (or ≥150 ms after it completed, whichever is later), exactly production's scheduling arithmetic.
- **Capture**: greedy ≤24,000-character production capture; the remainder stays pending and is drained by continuation calls, mirroring production's `dirty`/`more` scheduling.
- **Failures**: a deterministic rejection records production's `failure` state; a repeat on the same range opens a gap and advances coverage. Only non-deterministic transport errors abort (5 consecutive).
- **Lead usage**: per-reply `usage` extracted from the bundles' source JSONLs by matching feed event ids to source entry ids (read-only). Cross-checked against `metrics.json` `actorUsage`: ssmp matches within 0.01%; pi/buzz deltas are the worker streams and a handful of non-event-producing replies.

## Run shape

92 update wakes / 132 Luna replies / 79 accepted, 7 deterministic failures, 6 no-op wakes (pi 37 updates/46 calls, buzz 27/42, ssmp 28/44). Every staged event was consumed exactly once. Raw transcript text is not stored in any artifact.

## Deviations and residual risk

- Transcript idle gaps are not slept; measured cache share is an upper bound, and the worst-case-uncached figure bounds the effect.
- Compaction review payloads are not replayed (the synthetic session has no compaction entries): wake counts match, but input at those boundaries is smaller than production's.
- Worker settle proxy is the worker-final assistant stop; extracted receipts exist only where present, so up to 5 pi-packages delegate settles may be undercounted.
- The lead comparison uses the lead stream only; worker usage is reported separately, not folded in.
- Model behaviour includes real rejections; 7 deterministic failures are part of the measured cost, as they are in production.
- Independent recomputation of both totals from `mom-replies.jsonl` and `lead-replies.json` matches `run.json` exactly.

## Reproduce

```sh
cd pi-tether
npx tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext \
  --allowImportingTsExtensions --skipLibCheck experiments/cost-replay.ts
npx tsx experiments/cost-replay.ts --dry              # plan only, no model calls
npx tsx experiments/cost-replay.ts --fresh            # full run, ~33 min
```
