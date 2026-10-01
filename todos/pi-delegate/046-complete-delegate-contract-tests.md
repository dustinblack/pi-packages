---
status: complete
issue_id: "046"
tags: [pi-delegate, acpx, tests]
dependencies: ["043", "044", "045"]
forked_from: "039"
---

# Verify unified delegation and single-package loading

## Outcome

Deterministic tests and install smoke prove the unified delegate contract on both backends.

## Context

pi-delegate's suite covers in-process lifecycle. The ACP suite moved in by 041 covers ACPX/provider lifecycle through the Coordinator. New tests share contract fixtures from 040 and keep provider internals out of the Pi child path.

## Acceptance criteria

- [x] The `pi` backend regression suite stays green.
- [x] `acp` backend tests through `delegate`/`delegate_ctl` cover create, open, result, wait, failure, cancellation and capability errors.
- [x] A test proves the worker guard: under `PI_STRINGS_WORKER=1`, pi-delegate registers no tools.
- [x] Install smoke from 045 runs in the check script.
- [x] Verification records exact counts and any skipped prerequisites.

## Out of scope

Long-running real-provider tests (048).

## Evidence

Closing commit `1626b86`. `npm run check` now runs typecheck, test and check:install. In a clean worktree at `0c3b82c` it exits 0: 279 tests, 260 pass, 0 fail, 19 skipped; install smoke PASS.
- The 19 skipped tests are in `test/acp/integration/coordination-e2e.test.ts`. They need `PI_STRINGS_E2E=1`, the `PI_STRINGS_TEST_*_MODEL` variables, the agent executables, and `PI_STRINGS_E2E_WRITER_WORKTREE` for the writer cases.
- The action × backend matrix is in `docs/ACP_TEST_COVERAGE.md`.
- New tests in `test/delegate-contract.test.ts`:
  - a table-driven capability test;
  - every contract error code reached through the tools;
  - cancel on an opened idle run;
  - `RUN_NOT_PERSISTED`;
  - `SESSION_IDENTITY_CHANGED` after park.

  Removing each guarded behavior makes them fail.
- Code/ADR mismatches found, to fix after 058:
  - an unknown runId throws a plain Error, not `RUN_NOT_FOUND`;
  - a foreign-turn cancel gives `WORKER_NOT_RUNNING`, not ADR's `ACTION_UNSUPPORTED`;
  - pi open gives `FIELD_REQUIRES_ACP`, not ADR's `ACTION_UNSUPPORTED` (correct the ADR wording).
