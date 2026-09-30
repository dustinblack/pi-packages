---
status: ready
issue_id: "031"
tags: [pi-delegate, lifecycle, reporting, timeouts]
dependencies: []
---

# Delegate reports describe the latest segment, not stale prior work

## Outcome

Every start, steer, resume, timeout, cancellation, and completion is attributed to one explicit run segment. `delegate_ctl status`, `result`, completion notices, and timeout errors all describe the same latest segment and never repeat a stale report from an earlier segment.

## Context

- During Mom finish-line work, resumed children timed out or were cancelled but returned the final report from a previous successful segment.
- Re-armed timeout displays went negative because elapsed lifetime and per-segment deadline were mixed.
- Provider retry wall time, tool execution time, and model work time were presented as one undifferentiated duration.
- A run ID remains stable across steering; segment identity must therefore be explicit rather than inferred from run identity.

## Acceptance criteria

- [ ] Persist a monotonic segment ID with segment start, deadline, terminal status, and report ownership
- [ ] `status`, `result`, completion notices, and errors identify the same latest segment
- [ ] Resuming a completed child then cancelling or timing out cannot return the previous segment's report
- [ ] Re-arming `timeoutMs` yields a non-negative per-segment remaining duration and does not rewrite lifetime duration
- [ ] Provider retry wall time is reported separately from child task/tool time
- [ ] Lifecycle tests cover complete → resume → complete, complete → resume → timeout, and complete → resume → cancel
- [ ] Persisted older run records remain safely renderable without introducing a version matrix

## Out of scope

- Automatic model fallback
- Long-tool progress details; tracked separately

## Evidence
