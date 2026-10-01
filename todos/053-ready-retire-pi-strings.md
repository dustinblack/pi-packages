---
status: ready
issue_id: "053"
tags: [pi-strings, pi-delegate, migration]
dependencies: ["044", "045"]
forked_from: "039"
---

# Retire the pi-strings package and its op_* tools

## Outcome

Only pi-delegate remains. The pi-strings directory, extension entry and 12 `op_*` tools are gone, and nothing in the repo points at them.

## Context

The user decided on 2026-09-30 to fold pi-strings into pi-delegate. After 041 moves the code and 044 proves native opening through `delegate`, pi-strings is an empty shell. Repo-level references to it include the root `README.md`, `tasks/todo.md`, `tasks/pi-strings-foreground-design.md`, and open todos 021, 024 and 026–031. The `PI_STRINGS_*` env names may stay as-is; renaming them is a separate pending decision.

## Acceptance criteria

- [ ] `pi-strings/` is removed; its history is reachable from the moved files via `git log --follow`.
- [ ] No `op_*` tool is registered anywhere; delegate equivalents follow 040's mapping table.
- [ ] Repo references and open todos are repointed to pi-delegate, or marked historical.
- [ ] The user's local Pi install no longer loads pi-strings; `pi` starts clean.

## Out of scope

Unpublishing any npm release (needs explicit user approval), and renaming env vars.

## Evidence

Pending.
