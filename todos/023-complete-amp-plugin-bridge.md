---
status: complete
issue_id: "023"
tags: [pi-strings, amp, decision, conditional]
dependencies: ["019"]
forked_from: "018"
---

# Design a least-authority Amp plugin bridge

## Outcome

Design the smallest bridge that can provide bounded recent-message reads and per-thread event correlation when the native CLI cannot. This slice does not install, deploy, or connect a plugin.

## Context

Plugin state/history APIs, steering, and lifecycle message IDs exist, but host placement and cross-thread wake/permission semantics are unproven. A native client cannot import a plugin API into a live connection. Webhooks are capability secrets with at-least-once, unordered delivery, not completion receipts.

## Design (design-only)

### Scope

The bridge would add two read-only observations that the CLI does not provide:

- bounded recent messages from one exact thread;
- thread state plus `agent.start`/`agent.end` IDs for request correlation.

The bridge would not send messages, steer, cancel, change visibility, manage multiplayer, read full history, or expose participant identity. Native `op_send` remains the only contribution path.

### Recommended topology

- Run the plugin in the target Amp project or Orb. Do not install a system or global plugin.
- Keep Pi as the client and policy owner. The plugin only reads the exact allowlisted thread.
- Use a short-lived request and callback, not a permanent daemon. Each request has a random request ID, exact thread ID, expiry, and one-time callback credential.
- The documented plugin API provides durable webhook ingress, but it does not document a synchronous response channel or outbound HTTP client. A callback transport is therefore an implementation prerequisite, not an assumed capability. If a provider-supported callback cannot be proven, reject the bridge rather than add a guessed socket or private API.

### Read contract

The plugin reads `thread.state.get()` and `thread.messages({ from: 'end', limit, roles })`. `limit` is passed through to Amp's documented page limit; pi-strings does not invent a second hard maximum. Do not request `full: true`. Return the thread ID, provider message IDs, state, and observed messages. Do not retain a transcript outside the request record.

For correlation, return the provider's exact `agent.start` and `agent.end` IDs, status, and message IDs. If a callback lacks a matching request ID, thread ID, or provider event ID, report the result as unknown. Never infer completion from an idle state or the last assistant message.

### Security and lifecycle

- Authenticate the callback with TLS, a one-time bearer credential, exact target-thread and request-ID checks, and an expiry.
- Allowlist exact thread IDs. Reject visibility changes, cross-thread reads, and requests without explicit user authorization.
- Make event handling idempotent by provider event ID. At-least-once webhook delivery must not duplicate observations or contributions.
- Unsubscribe state observers and close callback resources on completion, timeout, plugin reload, or disconnect. A Pi timeout ends observation; it does not cancel Amp work.
- Store only bounded response evidence with source IDs. Treat callback loss, plugin shutdown, and provider errors as unknown.

### Rejected approaches

- No permanent webhook service before a callback need is proven.
- No plugin command that sends a new user message merely to obtain read data.
- No guessed private HTTP or WebSocket connection to Amp.
- No plugin authority for send, steer, cancel, visibility, multiplayer, or approvals.

## Acceptance criteria

- [x] The design names the missing capability, host, caller authentication, target allowlist, bounded data flow, disposal, and unknown-delivery behavior.
- [x] The user approves the design before any implementation or deployment. No separate extension or tool family.
- [x] Any later implementation remains separately authorized and uses the existing Amp adapter surface.
- [x] No plugin installation, deployment, scratch mutation, or bridge delivery claim occurs in this design slice.

## Out of scope

Implementation, installation, deployment, webhook creation, scratch mutation, and multiplayer attribution. Dependency 019 permits resolving a read-path blocker without a 029→021→022→023 cycle. Do not build against guessed internal APIs.

## Evidence

029 identifies one concrete native gap: the CLI adapter supplies exact identity, creation, continuation, and metadata, but it does not provide a bounded passive per-thread history/event cursor. `amp threads export` is unbounded, while `amp top` supplies activity snapshots rather than a transcript subscription or request receipt. The user approved this design-only phase. No plugin bridge is installed, deployed, or connected.

Design closed by user approval in commit `PENDING_COMMIT`.
