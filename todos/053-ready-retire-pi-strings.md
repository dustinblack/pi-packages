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

Closing commits `0238492` (delete pi-strings, `src/acp/index.ts` and 3 op_*-only tests) and `e737e76` (lessons kept in `pi-delegate/docs/ACP_LESSONS.md`).
- Clean worktree: typecheck clean; 244 tests, 225 pass, 0 fail, 19 skipped; `check:install` PASS.
- The user's `~/.pi/agent/settings.json` no longer lists pi-strings (removed with approval on 2026-09-30), and the leftover directory was deleted.
- Open work from pi-strings' task list is filed as 060 (writer boundaries) and 061 (E2E failures).
- Kept on purpose: the wire and state identifiers named pi-strings (`PI_STRINGS_*` env, adapter flags, `~/.pi/agent/pi-strings` state dir, config file names).
