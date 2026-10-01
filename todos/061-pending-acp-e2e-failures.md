---
status: pending
issue_id: "061"
tags: [pi-delegate, acpx, tests, e2e]
dependencies: []
---

# Fix the known ACP end-to-end test failures

## Outcome

`test:acp:e2e` (the 19 E2E-gated tests, `PI_STRINGS_E2E=1`) passes, or each remaining failure is a documented provider limit.

## Context

Rescued from the deleted `pi-strings/tasks/todo.md` (`git show 0238492^:pi-strings/tasks/todo.md`):
- **Real Pi parent kill:** a fixture bug. `test/acp/fixtures/hosted-parent-owner.ts` reads the nonexistent `worker.runtime.child?.pid`, so agentPid is always 0. It needs a `ps` scan for `--pi-strings-worker`.
- **Real Pi overlap, continuity and writer resume:** intermittent provider 503s surface as `RUNTIME`/`Internal error` with `retryable=false`. Look at how the adapter and ACPX classify them.
- **OpenCode writer boundary:** one flake that did not reproduce.
- **Unchecked:** "reload and repeat the monitored deep audit" after the parallel-call fingerprint fix.
- **Also unproven live:** the Pi 0.99 delta-only `message_update` fix in vendored pi-acp (`be7dbad`) has only fixture tests.

## Acceptance criteria

- [ ] The parent-kill fixture finds the real agent PID.
- [ ] Provider 5xx errors are classified as retryable where the provider says so.
- [ ] An E2E run on Pi 0.99 records exact pass/fail/skip counts, and the streaming tool-call fix is observed live.

## Out of scope

Writer-boundary enforcement (060).

## Evidence

Filed 2026-09-30 from pi-strings' task list at retirement.
