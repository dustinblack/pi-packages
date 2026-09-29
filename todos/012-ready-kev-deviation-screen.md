---
status: ready
issue_id: "012"
tags: [mom, pi-tether, kev, cost]
dependencies: ["003"]
---

# With Kev configured, Mom wakes only when the work actually moved

## Outcome

With Kev configured, a cheap check decides whether a user message or settled turn moved the work at all. Mom wakes only when it did.

## Context

- "Kev should screen user messages, don't always wake mom" [5827].
- "why aren't we doing more of a binary 'have things deviated from our current map?' and then let the mom model do the depth?" [5953]
- Kev is cheap and good at probabilities [5550], but optional [5103]. Status quo is the default [5811].
- Endpoint: `http://192.168.1.52:9999/v1/systemone` (LAN; the advisor code already has a loopback/RFC1918 guard).
- `advisor.ts` currently reviews a drafted update. This todo is screening before Mom wakes.

## Acceptance criteria

- [ ] Kev unconfigured → behavior unchanged (test)
- [ ] Kev configured → a turn screened as "no movement" makes zero Mom calls (test)
- [ ] On the 008 replays, report how many wakes were avoided and how often real movement was missed; misses caught later are acceptable (eventually consistent)
