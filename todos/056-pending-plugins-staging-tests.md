---
status: pending
issue_id: "056"
tags: [pi-plugins, tests]
dependencies: []
---

# Bring pi-plugins' staging tests back to green

## Outcome

`bun run test` in pi-plugins passes. Right now 46 of 1055 tests fail.

## Context

- Commit `8782834` moved skill and prompt output to `os.tmpdir()` (`extensions/pi-plugins/persistence/locations.ts:129-130`). The staging and materialization tests (PRL-10, SK-1..4, cross-bridge isolation, idempotency) still expect `<extensionRoot>/resources/...`.
- The failures are the same on Pi 0.74 and 0.99 (`e36f304`), so the migration didn't cause them.
- Decide whether the tests or the location code is wrong. Don't just repoint the assertions.
- `npm run check` also reports 18 eslint errors.

## Acceptance criteria

- [ ] All pi-plugins tests pass.
- [ ] The intended output location is stated in one place and the tests assert it.

## Out of scope

The eslint findings, unless they're in touched files.

## Evidence

Found by the Pi 0.99 migration agent on 2026-09-30.
