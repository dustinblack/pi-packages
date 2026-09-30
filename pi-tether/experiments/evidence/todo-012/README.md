# Todo 012 pre-wake screen evidence

Read-only measurement of the production `SystemOneAdvisor` screen against preserved todo-008 inputs. No Mom/Luna calls, no session or sidecar writes, and no raw transcript text is stored here.

## Files

- `screen-replay.json` — 26 preserved update windows (the raw todo-008 Mom call inputs) plus 15 preregistered aligned-gold-horizon windows, each scored once by `kev-latest` through `http://192.168.1.52:9999/v1/systemone`.
- `routine-sample.json` — 30 sampled routine feed events (assistant/tool/worker narrative with no lead direction), one event per window so the local endpoint does not time out on large tool-metadata batches.
- `calibrated-summary.json` — threshold sweep over the captured scores. No new model calls.

## Method

`pi-tether/experiments/kev-screen-replay.ts` and `kev-screen-routine-sample.ts` build the exact `SessionScreenInput` shape (saved map, one settled evidence batch, boundary context, pending state, open process risks) and call the same `SystemOneAdvisor.screen()` used in production. Threshold comparison is inclusive (`wake = needsUpdate >= threshold`).

## Results at the shipped default (0.25)

| Set | Windows | Wakes kept | Wakes avoided | Misses |
|---|---:|---:|---:|---:|
| Preserved todo-008 update inputs | 26 | 23 | 3 | 3 of 24 material proposals skipped |
| Aligned gold movement horizon | 15 | 15 | 0 | 0 |
| Sampled routine feed events | 30 | 19 | 11 | n/a (routine) |

Threshold `0.70` was measured and rejected: it skipped 14 of 15 gold movement windows and 23 of 24 material proposals. The default is the lowest captured gold score so every preregistered gold movement wakes.

## Limitations

- The 3 skipped material proposals are eventual-consistency risk; this run did not prove they are caught later.
- The endpoint timed out on full-length routine segments; the routine number comes from the 30-event sample, not every feed event.
- This measures wake decisions only. It is not todo-008 trajectory scoring, map quality, or cost acceptance.

## Reproduce

```sh
cd pi-tether
npx tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext \
  --allowImportingTsExtensions --skipLibCheck experiments/kev-screen-replay.ts \
  experiments/kev-screen-routine-sample.ts
cd ..
npx tsx pi-tether/experiments/kev-screen-replay.ts
npx tsx pi-tether/experiments/kev-screen-routine-sample.ts
```
