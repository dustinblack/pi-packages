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
