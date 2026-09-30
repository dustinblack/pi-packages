---
status: ready
issue_id: "033"
tags: [pi-delegate, progress, tools, cancellation]
dependencies: ["017", "025"]
---

# Long delegate tool calls expose factual progress without waking the model

## Outcome

While a child is inside a long tool call, `delegate_ctl status` shows factual current progress—tool identity, elapsed time, process liveness, and bounded output/checkpoint facts—without synthetic summaries, parent polling loops, or extra model turns.

## Context

- Long bash/Luna replay commands looked identical to a stalled child for many minutes.
- The parent responded by scheduling repeated status prompts, which created orchestration churn without improving the child.
- pi-delegate already exposes the current tool. Extend recorded facts; do not invent percent-complete estimates.

## Acceptance criteria

- [ ] Tool-call start, elapsed duration, and liveness are available during execution
- [ ] Long subprocess tools expose bounded factual output progress such as bytes/lines/timestamp, never unbounded transcript tails
- [ ] A child can publish an explicit durable checkpoint path/hash without a model turn
- [ ] `status` distinguishes active tool work, provider retry/backoff, idle thinking, and stalled/dead process states
- [ ] No periodic parent-model wake, scheduled prompt, or busy-poll is required
- [ ] Ctrl+C/cancel still terminates the wait/tool path and reports the latest checkpoint
- [ ] Tests cover a long silent command, a command emitting progress, cancellation, and crash recovery

## Out of scope

- Semantic progress percentages
- Parsing application-specific logs
- Intercom delivery during waits; covered by 017

## Evidence
