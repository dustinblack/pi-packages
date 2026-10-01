---
status: complete
issue_id: "043"
tags: [pi-delegate, acpx, lifecycle]
dependencies: ["042"]
forked_from: "039"
---

# Map delegation lifecycle controls across backends

## Outcome

`delegate_ctl` wait, result, status, steer, cancel and close behave consistently for both backends and keep backend-specific evidence and authority.

## Context

Pi children support durable run segments and revival. ACP workers support provider requests, native sessions, explicit delivery and bounded cleanup. A unified status must not turn remote acceptance into completion, or a local disconnect into remote cancellation. Follow 040's `op_*` mapping table for observe/append/cancel_remote/close.

## Acceptance criteria

- [x] Each `delegate_ctl` action maps to the run's backend.
- [x] Wait/result preserve request IDs, native IDs, delivery, output bounds and terminal causes.
- [x] Steer and cancel check capabilities explicitly; unsupported ACP steering fails instead of falling back.
- [x] Close/disconnect never implicitly cancels externally owned native work.
- [x] Lifecycle tests cover success, timeout, provider failure, ambiguous delivery and cancellation on `acp`.

## Out of scope

New provider APIs, multiplayer controls, UI redesign.

## Evidence

Closing commit `ab1dd31`.

Validation, run in a clean worktree of committed HEAD plus the 043 changes, with real npm:
- Typecheck clean.
- pi-delegate: 247 tests, 228 pass, 0 fail, 19 skipped (E2E-gated). That is 233 + 14 new: `test/acp-lifecycle.test.ts` and 2 Coordinator unit tests.
- pi-tether: 145/145.

`tether-feed` fails in the shared tree because of another session's uncommitted pi-tether edits; it passes against committed pi-tether.

What shipped:
- ACP run records persist under `.agents/pi/subsessions/owners/<parent>/acp/`.
- On exit, runs are parked: created sessions close without discard, opened ones disconnect.
- Status, result and wait read the records after a restart, without starting a Coordinator.
- steer revives a parked run. Opened runs reopen by native ID with an identity check. Created runs go through Coordinator `resume` over ACPX loadSession/resume, else `RUN_NOT_RESUMABLE`.
- Created turns record delivery `accepted` only when the provider reports completion.
- Multi-run wait spans pi and acp.

New codes: `RUN_NOT_RESUMABLE`, `RUN_OWNED_ELSEWHERE`, `RUN_NOT_PERSISTED`, `RESUME_UNSUPPORTED`, `RESUME_PROVENANCE_UNKNOWN`.

Open: ADR 0001 and `ARCHITECTURE.md` don't describe parking yet (047). The restart test runs in-process, not as a separate OS process.
