---
status: complete
issue_id: "017"
tags: [pi-delegate, intercom, responsiveness]
dependencies: []
---

# Blocking delegate waits answer intercom traffic instead of ignoring it

## Outcome

While a lead sits in a blocking `delegate_ctl wait`, inbound intercom messages are surfaced and answerable during the wait — at worst surfaced at wait completion — instead of being invisible until the child run ends.

## Context

- User direction (in-session, 2026-09-29): "Seems like pi-delegate wait would be better off allowing intercoms and responding.. maybe doing a periodic check for things like that during the waits."
- Observed tonight: an intercom `send` was broker-accepted (`intercom_sent` in the sender's session) but absent from the receiver's transcript for ~18 minutes while their status was `tool:delegate_ctl`; it was injected the moment their blocked turn unwound (`custom_message:intercom_message` at line [7302], 18:51:27). **The message was deferred, not dropped — and `intercom pending` stayed empty throughout the defer.** Design consequence: a fix that only polls `pending` will still miss deferred sends; the mechanism must queue deferred sends into a visible store or poll the broker itself.
- Prior art: pi-delegate already shows a blocking join in the transcript (commit `9940f5d`); `intercom pending` already lists unresolved inbound asks.
- Design latitude is the implementer's: time-slicing the wait, polling the intercom store on an interval, or releasing/re-entering the tool with a "messages arrived" notice. Keep it a recorded-facts mechanism, not a heuristic.
- Host API facts (verified 2026-09-29 in pi dist): `ExtensionContext.hasPendingMessages()` = `pendingMessageCount > 0` (`dist/core/extensions/types.d.ts`, `agent-session.js:2457`); pi's steering is delivered "after the current assistant turn finishes executing its tool calls, before the next LLM call" (`docs/rpc-commands.md`), with RPC `steer`/`follow_up`/`queue_update` surfaces; pi-intercom delivers held inbound as mode `"steer"` (`index.ts:1845` region). A blocking tool call postpones that delivery window — the circular wait that deferred our message ~18 minutes.
- making-mom's read-only worker reported a host-signal gap: `hasPendingMessages` ignores a custom `steeringQueue`. NOT YET CONFIRMED in core dist (symbol not found outside a source map); verify during implementation and treat as a claim until then.
- Ownership: taken by mom-and-graphs (this lane) at the user's direction, 2026-09-29. making-mom released it fully (implementation, review, integration, closure). pi-intercom is a third-party npm package (nicobailon/pi-intercom, registry.npmjs.org, no local source). **User directive: NO pi-intercom edits** — the intercom half (local patch plus upstream PR) is out of scope and will not be done.
- This is a new pi-delegate change. It was proposed by the user in-session; the standing "don't change existing packages until the new thing proves itself" rule otherwise applies.

## Acceptance criteria

- [ ] A test: an intercom send arriving during a blocking wait is visible/answerable before the child completes (or surfaced at completion if mid-wait response is infeasible — state which, with the measured bound)
- [ ] Inbound `ask` messages retain their reply semantics and timeout behavior
- [ ] The wait loop does not busy-poll (bounded interval, no CPU spin) and Ctrl+C/abort behavior is unchanged
- [ ] pi-delegate checks pass; no behavior change when no messages are pending

## Out of scope

- Interrupting the child run itself
- Non-intercom inbox types beyond pending asks
- Any pi-intercom edit and any end-to-end intercom delivery fix (user directive; the observed 18-minute defer parked at broker/receiver delivery, which this todo cannot change)

## Evidence

- Commits on main: `bf28847` (todo), `0efe7f8` (delegate-side wake), `6845064` (host-signal facts and ownership). Pushed via HTTPS; preserved on main alongside making-mom's 007 work (confirmed `5edfb47` era).
- Behavior: `delegate_ctl wait` now (a) wakes instantly on settle via `RunCompletion.subscribe()` — no latency regression, (b) polls `ctx.hasPendingMessages()` at a bounded 1s interval, (c) returns a **normal** result (`isError: false`) with "wait interrupted — queued messages are waiting; the child keeps running. Answer them, then call wait again to rejoin." The child is never cancelled or settled by the wake. Cancel/abort semantics unchanged (`Wait cancelled; the child is unaffected.`).
- Validation: `cd pi-delegate && npm run check` — typecheck + **39/39 tests**, including the new "wait wakes early for queued messages, keeps the child running, and rejoins" cycle (wake → status running → rejoin → complete `WAKE-OK`). Suite measured within its 60s budget after the settle-wake redesign.
- Known limitation, stated not hidden: for messages that reach pi's queue the wake bound is ≤1s. Tonight's live 18-minute defer parked BEFORE pi's queue (receipts stamped together at delivery), in the broker/receiver path this todo is now forbidden to touch. End-to-end intercom delivery during waits is therefore NOT fixed and NOT claimed.
- Design handoff: `025` covers crash-aware waiting on the same poll loop.

