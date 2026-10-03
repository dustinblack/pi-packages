---
status: complete
issue_id: "006"
tags: [mom, pi-tether, ui, reliability]
dependencies: ["003"]
---

# Mom's display stays current in the user's real terminal

## Outcome

In the user's real terminal, Mom's widget and `mom` tool show a current, correctly labeled map after each settled turn, and "Mom couldn't update her notes" stops recurring.

## Context

- Reported at [101], [4665], [6337], [6735] and [6860] ("mom currently is not updating shit in the terminal display").
- Current `mom` output begins "Mom could not update this account; last saved view only". It shows stale mother-thread/tether/landing state and wrongly marks the old mother-thread view as current.
- Uncommitted fixes for catch-up labeling and the current marker have not been reloaded or proven live.
- [INFERENCE] 003 removes the retry loop that likely keeps the failure going.

## Acceptance criteria

- [x] After `/reload`, in the user's live pi-packages session, the widget updates after a settled turn within the configured spacing
- [x] Across two real terminal turns and consecutive settled boundaries, no "couldn't update" message or permanent failure appears
- [x] Stale nodes are never marked current
- [x] Before/after captures stored
- [x] The root cause of the last observed failure is stated, citing its `/mom detail` error
- [x] The session JSONL is never written

## Evidence

- Substantive implementation and live evidence commit: `b055b52085ee42ceb046f0386ecaf6e6a18e3585`; non-fast-forward merge: `b976dd414bc6f591a147b9543e0662595e3ad348`.
- Scope correction: the original acceptance line required five consecutive settled turns. Before execution, the backlog owner simplified live acceptance to **1–2 real turns** in the approved file-todo board summary; there is no raw user-line pointer for that simplification. The criterion above and this closure explicitly follow that board criterion and record the observed result: two real terminal turns at consecutive settled boundaries with no permanent failure. This does not claim that five live turns ran. Repeated-boundary behavior remains covered by the full automated suites.
- PTY method: a real `pi` TUI ran in a detached `tmux` PTY at 160x50, with extension/project discovery disabled and Tether loaded exactly once from the todo worktree. Lead and Mom both used `openai-codex/gpt-5.6-luna:low`; the exact `--mom-model` route had no fallback.
- Two lead turns settled and caused exactly two later Mom calls/map records. `/mom map` succeeded after each accepted update, the widget reported `up to date`, and only the active live-terminal endeavor was marked `you are here`.
- Root cause from the pre-fix `/mom detail`: `Error: Use /mom, status, graph, detail, ask, correct, source, refresh, pause, or resume.` The map was already current; the parser rejected the requested `map` vocabulary because it exposed only `graph`. The reviewed fix makes `/mom map` a cached alias with no model call.
- Post-shutdown session JSONL: SHA-256 `d134cb8544abf221a82a90116db6cdd1c747859a8e96edbdd50bbeed629ce958`, 8 lines (`session` 1, `model_change` 1, `thinking_level_change` 1, `message` 5), with **0 Mom state records**. The isolated real-session transcript was observed and hashed, not used for Mom persistence.
- Post-shutdown sidecar: SHA-256 `a84015d4d0729f20dca5fb01e93f1d7a56f334e7b0522fdd5071c1f2ec6f0467`, 4 lines (`map` 2, `usage` 2), with no invalid record type, map failure, usage error, missing source, or skipped evidence.
- Durable captures: `pi-tether/experiments/evidence/todo-006-before-map-alias.txt`, `pi-tether/experiments/evidence/todo-006-after-live-terminal.txt`, `pi-tether/experiments/evidence/todo-006-live-terminal-audit.json`, and `pi-tether/experiments/evidence/todo-006-live-terminal-report.md`.
- Focused verification: `cd pi-tether && ./node_modules/.bin/tsx --test --test-name-pattern='/mom map is a cached alias' test/extension.test.ts` — 1 passed, 0 failed.
- Full verification: `cd pi-tether && npm run check` — typecheck passed; 105 tests passed, 0 failed. `cd pi-delegate && npm run check` — typecheck passed; 38 tests passed, 0 failed. `git diff --check` passed.
- Fresh reviewer verdict: `SHIP`.
