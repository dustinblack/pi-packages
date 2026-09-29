# Todo 006 — real Pi terminal acceptance

Captured on 2026-09-29 with a real `pi` TUI under a detached tmux PTY. This was not an SDK or unit-test substitute.

## Invocation

The fresh project and session lived under `/private/tmp`. Global authentication was reused by Pi; no credential was printed or copied. Extension and project discovery were disabled, and Tether was loaded exactly once:

```text
pi --no-extensions --no-skills --no-prompt-templates --no-context-files --approve \
  --extension /private/tmp/pi-packages-todo-006/pi-tether/src/index.ts \
  --session <isolated>/session.jsonl \
  --model openai-codex/gpt-5.6-luna --thinking low \
  --mom-model openai-codex/gpt-5.6-luna --mom-interval-ms 500
```

Lead model: `openai-codex/gpt-5.6-luna:low`, confirmed by both assistant records in the session JSONL. Mom model: `openai-codex/gpt-5.6-luna:low`, selected by the exact no-fallback `--mom-model` flag; two sidecar usage records and `/mom detail` report two Mom calls.

## Before and root cause

The first PTY run reached a current live widget after its settled turn, but the required `/mom map` command failed. `/mom detail` gave the exact last-read error:

```text
Error: Use /mom, status, graph, detail, ask, correct, source, refresh, pause, or resume.
```

The command parser exposed only `graph`, despite the requested map vocabulary. This was not a feed or model update failure: the widget was already current. The smallest fix makes `map` a cached alias of `graph`, documents it, and adds a command regression test. See `todo-006-before-map-alias.txt`.

The older recurring "couldn't update her notes" report did not reproduce with the current clean sidecar format and bounded update policy. In the post-fix run, both durable map records have `failure: null`, both usage records have `error: null`, `missingSources` and `skippedEvidence` are empty, and the current marker appears only after complete coverage.

## Post-fix live result

Two real lead turns settled. Each caused one later Mom map record, after the assistant response—not during the turn:

| Turn | Assistant timestamp (UTC) | Mom map timestamp (UTC) | Result |
|---|---:|---:|---|
| 1 | 17:45:54.674 | 17:46:03.687 | Current `pi_acceptance` endeavor rendered |
| 2 | 17:46:19.765 | 17:46:31.396 | New hash-evidence rule rendered |

In the same process, `/mom map` succeeded after each accepted update. The final map contained both the live-terminal endeavor and the new requirement to record session and sidecar hashes. The widget said `up to date` and marked that active endeavor `you are here`; no stale node received a current marker. See `todo-006-after-live-terminal.txt`.

## Persistence audit

The final files were hashed after orderly TUI shutdown:

- Session: SHA-256 `d134cb8544abf221a82a90116db6cdd1c747859a8e96edbdd50bbeed629ce958`, 8 lines.
- Sidecar: SHA-256 `a84015d4d0729f20dca5fb01e93f1d7a56f334e7b0522fdd5071c1f2ec6f0467`, 4 lines.
- Session record families: `session` 1, `model_change` 1, `thinking_level_change` 1, `message` 5.
- Mom state records in session JSONL: **0**.
- Sidecar record families: `map` 2, `usage` 2; invalid types: **0**.

The machine-readable audit is `todo-006-live-terminal-audit.json`.

## Scope note

The delegated acceptance brief intentionally bounded live model work to two turns. The committed full suites cover repeated settled boundaries; this capture makes no unsupported claim that five separate real-model turns were executed.
