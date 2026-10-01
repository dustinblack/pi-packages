---
status: complete
issue_id: "058"
tags: [pi-delegate, acpx, amp]
dependencies: ["042"]
forked_from: "039"
---

# Report Amp cost, select Amp mode, and label delegated threads

## Outcome

ACP Amp runs show their cost in `delegate_ctl status`/`result`, accept Amp's agent mode, and every thread delegate creates carries a label tied to its run.

## Context

- **Cost:** `amp threads usage <T-ID>` prints `Cost: $…` plus Orb system metrics. On `T-01a0f0b4…` it reported $2.12 on 2026-09-30. pi-delegate's run view already has usage/cost fields, so fill them for Amp runs rather than adding a new one.
- **Mode:** `--mode low|medium|high|ultra|<plugin mode>` sets Amp's model, system prompt and tools. `vendor/amp-acp/src/index.ts:176` already passes `options.mode`; expose it as a delegate option for acp:amp and reject it on other agents.
- **Labels:** `amp threads label` and `--title`. Label created threads with the delegate run ID so `amp threads list` and `amp top -l` find them exactly. The user objected at [2610] to leftover test threads. Opened (existing) threads are never relabeled or retitled.
- Gap found in 044: created Amp runs don't set `nativeSessionId` in the delegate view, though the adapter learns the T-ID from `--stream-json` (`session_id`). Labeling and cost need it, so surface it here.
- The user chose these three on 2026-09-30. Archiving created threads on close was not chosen, so created threads stay unarchived as today.

## Acceptance criteria

- [x] An Amp run's status/result include its cost, or `unknown` when usage is unavailable. Missing cost never blocks a result.
- [x] `mode` reaches `amp --mode` for created and continued Amp threads and fails explicitly for non-Amp agents.
- [x] Every created Amp thread carries the run label; opened threads are untouched.
- [x] Fixture tests cover each case; a real-Amp check is part of 048.

## Out of scope

Archiving, visibility, multiplayer, the runner executor and live watch (059).

## Evidence

Closing commit `018901d`, with review fixes in `46ac9d6`. `npm run check` passes at `11ae604`: 323 tests, 304 pass, 0 fail, 19 skipped.
- Created Amp runs show their T-ID.
- `mode` reaches `amp --mode`. It is refused on pi (`FIELD_REQUIRES_ACP`), on non-Amp agents (`FIELD_REQUIRES_AMP`) and on opened threads.
- Created threads get labels `<run uuid hex>` and `pi-delegate` (Amp labels are at most 32 lowercase chars), plus a title.
- Cost is read once per settled turn and in status/result, and cached; a failed read keeps the last known cost.
- Live (048): local thread `T-01a0f65d…` had both labels and was found by `label:<hex>`, with cost $0.01. The Orb thread's cost read $2.12 → $2.45, and opened threads were untouched.
