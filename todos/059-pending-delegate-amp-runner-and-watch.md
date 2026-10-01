---
status: pending
issue_id: "059"
tags: [pi-delegate, acpx, amp]
dependencies: ["058"]
forked_from: "039"
---

# Add the Amp runner executor and a live watch of human activity

## Outcome

Delegated Amp runs can target a headless Amp runner on this machine, and an opened thread can be watched for other participants' messages without repeated full exports.

## Context

- **Runner:** `amp --execute --executor runner:<id>`, with runners listed by `amp runner list`. This is a third execution environment beside local and Orb.
- **Watch:** observation is on demand today, with one `amp threads export` (~0.5 s full dump) per `status`. For a live watch, poll `amp threads list --json` for `updated` and export only on change, or use `amp top`. Don't rely on `messageCount`: it showed 3 where the export had 14 messages.
- Deferred on 2026-09-30. Gate: the user asks for either capability after 058 lands.

## Acceptance criteria

- [ ] `executionEnvironment` accepts a runner ID, verified against `amp runner list`.
- [ ] A watch reports new messages from other participants within a stated latency, with no full export per tick.

## Out of scope

Orb services, portals, desktop, projects administration.

## Evidence

Pending.
