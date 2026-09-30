---
status: ready
issue_id: "015"
tags: [mom, pi-tether, cost, acceptance]
dependencies: ["003", "005", "006"]
---

# Mom's model usage on a realistic session stays below the lead's

## Outcome

On a realistic live session, Mom's model usage is measured per call and stays below the lead's, so she does not double usage.

## Context

- "we don't necessarily want to double or more the model usage with this Mom approach, nor do we want to slow things down" [847].
- Earlier: 787 Mom calls and $2.02 in one session under per-event waking [6766].
- The cause of the cache gap was never proven.
- Earlier single-case measurements are not comparable to a full session.

## Acceptance criteria

- [ ] Usage is recorded per reply over one real multi-hour session, or over the 008 replays run at live cadence
- [ ] Mom's total tokens and nominal cost are below the lead's
- [ ] The cache share is reported
- [ ] If Mom exceeds the lead, a follow-up todo names the measured driver

## Findings

- Read-only inventory on 2026-09-30 of `~/.pi/agent/sessions/*/*.mom` found one sidecar: the making-Mom session. It spans 18.11 hours but contains the obsolete `control`/`attempt`/`checkpoint` layout (1/101/65 records), not the current `map`/`notice`/`usage` runtime. This is historical evidence, not current-runtime cost acceptance.
- The committed 006 capture records two settled turns and two Mom calls; it does not meet this todo's multi-hour or live-cadence replay criterion.
- Required evidence is still a current-runtime multi-hour session with per-reply lead and Mom usage, or a completed live-cadence replay. No new replay was started for this inventory; no session or sidecar was changed.
