---
status: ready
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
