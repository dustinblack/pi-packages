---
status: ready
issue_id: "014"
tags: [mom, pi-tether, ui]
dependencies: ["006"]
---

# The user can switch to a Mom view and talk to her directly

## Outcome

The user can switch to a Mom view and talk to her directly, the way they switch to a pi-delegate agent, without `/mom` commands.

## Context

- "Make a todo to make it so we can switch to the dedicated mom view and even interact directly adhoc with that agent without /mom commands. Similar to how pi-delegate works… Lower in pri than the other items" [6940].
- Prior art: pi-delegate's agent switching (the Ctrl+J Agents key).

## Acceptance criteria

- [ ] Switching into the Mom view and back works
- [ ] An ad hoc question is answered from the map
- [ ] Returning to the lead leaves its context untouched
- [ ] A test covers the switch and the return
