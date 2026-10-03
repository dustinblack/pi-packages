---
status: complete
issue_id: "065"
tags: [mom, pi-tether]
dependencies: []
---

# Post-compact anchor injection with an injection ledger

## Outcome

After a successful compaction, the lead's next request carries a code-rendered anchor — the mother-thread purpose verbatim with its citation, active standing rules, current endeavor, parked work, and last side effects — and every injection into the lead's context is durably recorded and visible to the user in one read.

## Context

- Settled design: `MOM-INTERFACE.md` (repo root). Injection happens at the compaction boundary only, never per turn; this amends `MOM-BRIEF.md` §3.2.
- A delivery path exists: the next-request notice route in `pi-tether/src/index.ts` (`deliver`, NOTICE `sendMessage`), but it is one hidden line (`display: false`). The anchor is structured content rendered by code from the accepted checkpoint (`checkpoint.ts`, `presentation.ts`, `graph.ts`), never a model call.
- The purpose is already stored verbatim as a complete normalized token sequence with a `purposeSource` citation on the mother-thread root; rules attach to endeavors. Recent side effects are recoverable from feed tool metadata (`feed.ts`).
- The ledger extends the sidecar's append-only records (`sidecar.ts`) with one record per injection, including the existing process notices. The widget footer shows the injection state (for example `pinned · re-anchored after compact 14:32`), and a `/mom log` read lists injections with sources.
- The anchor is omitted while Mom is catching up (reuse the widget's existing `complete` gate) and injects from the last accepted checkpoint even when the compaction audit itself fails.

## Acceptance criteria

- [x] Live capture (or loopback-fidelity): after a compaction the first post-compact lead request contains the anchor; requests between compactions contain none
- [x] The anchor renders the mother-thread purpose verbatim with its `purposeSource` citation, active standing rules, current endeavor, parked work, and last side effects, with no model call at render time
- [x] The anchor injects from the last accepted checkpoint when the compaction audit fails, and is omitted while catching up
- [x] Every injection, including existing process notices, is recorded in the sidecar and visible in one read (widget footer plus `/mom log`) with sources
- [x] Deterministic tests cover render content, catching-up omission, audit-failure fallback, and ledger records
- [x] `cd pi-tether && npm run check` passes

## Out of scope

- The post-compact verification window (todo 066) and the on/off controls (todo 067)
- `/mom diff` and routing changes for authority-bearing risks (open decisions, `MOM-INTERFACE.md` §5)

## Evidence

- `cd pi-tether && npm run check` passed 2026-10-02: typecheck clean and 196/196 tests. The 065 slice adds `src/anchor.ts` and `test/anchor.test.ts` (9 tests); the rest of the suite is unchanged and green. The shared machine's load spikes (~30) produced unrelated timeout flakes in `advisor`/`graph-runtime` tests during one run; both pass in isolation and at sane load. The flagship anchor test uses a 30s timeout for its four-prompt + audit + reload flow and runs ~2s at sane load.
- Loopback fidelity, not a live provider capture: the delivery tests drive the real Pi runtime — real compaction path, real `sendMessage`, real sidecar writes — with scripted model replies. The first post-compact lead request carries exactly one anchor; no second anchor is injected on later requests; a session reload delivers no repeat. On the wire the anchor is a custom session entry (`display: true`) rendered as a user message directly before the new prompt (verified order: system → compaction summary → kept tail → anchor → new prompt).
- Render is pure code from the last accepted checkpoint, no model call: verbatim mother-thread purpose with its `purposeSource` citation, at most five verbatim rules with sources, the current endeavor (annotation focus noted as attention), at most six parked labels, at most three recent side effects (commits and test runs, oldest first, 600-event window, 160-char clip). A failing-audit test confirms the fallback injects from the last accepted map.
- "Omitted while catching up" is resolved as: durably skipped with the reason `Mom had no saved map to anchor from` while Mom has no accepted checkpoint (her cold catch-up). The widget's full `complete` gate was deliberately not reused: it contradicts the settled design's audit-failure clause (inject from the last accepted checkpoint) and would strand the first post-compact request whenever Mom is merely behind on incremental reading. `openingError` and `mom.enabled` still gate delivery, and a queued-but-undeliverable anchor stays visible as `anchor queued after compact`.
- Injection ledger: every anchor and notice appends a sidecar record (`injection` pending → delivered/skipped; `notice` delivered) and surfaces in one read — widget footer (`anchor queued after compact` / `anchored after compact HH:MM`) and the new `/mom log` (delivered anchor content, delivered notices with `riskClass:target`, skips with reason). Verified ledger order: `injection:pending` → `notice:delivered` (input event) → `injection:delivered` (`before_agent_start`).
- Closing commit: `31744d5` (`feat(pi-tether): inject a post-compaction continuity anchor with an injection ledger`), pushed to `origin/main` on 2026-10-02. No adjacent todos filed; 066 and 067 already cover the follow-on window and controls.
