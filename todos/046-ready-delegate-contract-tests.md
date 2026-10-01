---
status: ready
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

- [ ] The `pi` backend regression suite stays green.
- [ ] `acp` backend tests through `delegate`/`delegate_ctl` cover create, open, result, wait, failure, cancellation and capability errors.
- [ ] A test proves the worker guard: under `PI_STRINGS_WORKER=1`, pi-delegate registers no tools.
- [ ] Install smoke from 045 runs in the check script.
- [ ] Verification records exact counts and any skipped prerequisites.

## Out of scope

Long-running real-provider tests (048).

## Evidence

Pending implementation.
