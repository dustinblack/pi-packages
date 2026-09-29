---
status: ready
issue_id: "007"
tags: [mom, pi-tether, map]
dependencies: ["003"]
---

# The map covers the session's full purpose and shows the mother thread as a node

## Outcome

The map for this project goes back to the session's original purpose, and shows the coordinating mother thread as one of its nodes.

## Context

- "the current mom showing for this project needs to be focused on pi-tether/mom and clearly isn't going back far enough to know the full context and purpose of this session" [6972].
- "it needs to show that it has a coordinating mother thread as one of its nodes" [6981].
- Each call carries only the current graph plus a new slice, so catching up from cold needs several bounded updates.
- Prior art: the `thread-map` skill (`~/.pi/agent/skills/thread-map/`) segments a session at its compaction boundaries.

## Acceptance criteria

- [ ] On a read-only copy of the making-mom session, the map root states the original purpose (Tether → Mom) and the top-level endeavors across its chapters
- [ ] The mother thread appears as a node
- [ ] Catch-up stays within the 003 budget per update (multiple updates allowed)
- [ ] A test covers cold catch-up
