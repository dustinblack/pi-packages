---
status: ready
issue_id: "046"
tags: [pi-delegate, pi-strings, tests]
dependencies: ["042", "043", "044", "045"]
forked_from: "039"
---

# Verify unified delegation and combined loading

## Outcome

Prove the unified delegate contract and both backends with deterministic tests and package install smoke.

## Context

Existing pi-delegate tests cover in-process lifecycle; pi-strings tests cover ACPX/provider lifecycle. New tests should share contract fixtures without coupling provider internals to Pi child sessions.

## Acceptance criteria

- [ ] Pi backend regression suite remains green.
- [ ] ACPX backend tests cover create, open, result, wait, failure, cancellation, and capability errors.
- [ ] Combined extension loading has no tool or resource collision.
- [ ] Install smoke verifies packaged files, dependencies, and extension discovery.
- [ ] Verification records exact counts and skipped prerequisites.

## Out of scope

Long-running real-provider tests; those belong to 048.

## Evidence

Pending implementation.
