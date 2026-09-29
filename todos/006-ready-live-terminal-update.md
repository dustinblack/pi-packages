---
status: ready
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

- [ ] After `/reload`, in the user's live pi-packages session, the widget updates after a settled turn within the configured spacing
- [ ] No "couldn't update" message across 5 consecutive settled turns
- [ ] Stale nodes are never marked current
- [ ] Before/after captures stored
- [ ] The root cause of the last observed failure is stated, citing its `/mom detail` error
- [ ] The session JSONL is never written
