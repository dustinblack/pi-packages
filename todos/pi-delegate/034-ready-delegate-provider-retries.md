---
status: in_progress
issue_id: "034"
tags: [pi-delegate, providers, retries, errors]
dependencies: []
---

# Provider retries fail fast and remain separate from task execution

## Outcome

Transient provider retries are bounded, visible, and accounted separately from the child's task budget. Repeated transport failure ends with a precise provider error instead of silently consuming most of the delegate timeout.

## Context

- Several children spent most of five- to thirty-minute segments retrying `fetch failed`, connection errors, or response-header timeouts before doing any task work.
- Completion reports then mixed retry wall time with task execution and sometimes showed no child turns despite an exhausted timeout.
- Named providers must never silently fall back to another offering.

## Acceptance criteria

- [ ] Status exposes provider attempt count, latest error class, backoff, and retry wall time while retries are active
- [ ] Provider retry policy has an explicit attempt and wall-time ceiling independent of `timeoutMs`
- [ ] Exhausting the provider ceiling returns a terminal provider failure before the task budget is consumed
- [ ] Once a model response begins, normal per-segment timeout accounting applies
- [ ] Reports separate provider retry time, model time, and tool time
- [ ] No silent provider/model fallback; changing offering still requires user choice
- [ ] Deterministic tests cover connection failure, header timeout, recovery on a later attempt, task timeout after recovery, and cancellation during backoff

## Out of scope

- Choosing a replacement model automatically
- Provider-specific network repair

## Evidence

- 2026-10-02: pi children now expose live `auto_retry_start` state in `delegate_ctl status`, accumulate provider retry wall time, and stop after 3 retries or 120 seconds independently of the task timeout. Loopback coverage proves the live status and terminal ceiling; `npm run typecheck` and the full `npm test` pass (333 passed, 19 skipped).
- Remaining: recovery, provider-header timeout, post-recovery task timeout, cancellation during backoff, and the final time split for model/tool work.
