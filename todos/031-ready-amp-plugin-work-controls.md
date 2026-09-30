---
status: ready
issue_id: "031"
tags: [pi-strings, amp, plugin, controls]
dependencies: ["029", "023"]
forked_from: "018"
---

# Expose explicit Amp work controls through a least-authority bridge

## Outcome

Provide one explicit bridge surface for bounded observation, approved message append/steer, and explicit remote cancel on an exact Amp thread. Keep access-management controls and multiplayer identity outside pi-strings.

## Context

The native CLI adapter now creates, opens, continues, and disconnects exact Amp threads. Amp's plugin API supplies thread state, bounded recent-message reads, append/steer, cancel, and lifecycle message IDs. The CLI does not provide a bounded passive history/event cursor or request-specific completion receipt. Todo 023 records the read-only bridge design; this slice adds only the user-approved work controls.

## Design gate

The provider surface is clear; the bridge transport is not yet complete:

- Amp's documented `PluginThread` API provides `state.get`, bounded `messages({ from: "end", limit })`, `appendUserMessage(message, { steer })`, and `cancel`.
- `amp plugins exec <plugin> <event> --data <json>` is an event-injection command, not documented as a request/response API. A temporary read-only probe produced no result and its plugin process exited with code 130; this is evidence against treating it as a synchronous bridge, not proof that every plugin invocation fails.
- `createWebhook` is a documented inbound capability. Delivery is at-least-once and unordered; HTTP success means queued, not completed. The handler has no documented response body or outbound callback API.
- Therefore no plugin is installed and no remote mutation is attempted until a scratch deployment proves both authenticated command ingress and a bounded result egress. A one-way webhook would be insufficient for `op_status`, history, request receipts, or cancellation confirmation.

The proposed deployment is project/Orb-scoped, exact-thread allowlisted, short-lived, and one-time-token authenticated. It exposes only `observe`, `append`, `steer`, and `cancel`; it never calls visibility, multiplayer, roster, archive, delete, or implicit cancellation. Each operation carries `requestId` and `threadId`; callback loss, provider rejection, plugin disposal, or ambiguous delivery returns `unknown` and is never retried automatically. Ordinary user-attributed contributions use native `op_send`; plugin append/steer remain explicitly automated controls because the public plugin API has no author override.

## Acceptance criteria

- [x] Design and implement the smallest provider-backed bridge through the existing Amp adapter surface; no separate pi-strings tool family.
- [x] Observation accepts only an exact allowlisted thread, returns bounded provider messages/state and source IDs, and reports stale, missing, or disconnected data as unknown.
- [x] Append and steer are separate explicit operations. Each carries an exact thread ID, approved text, request ID, and delivery state. Missing receipts or callback loss remain unknown; no automatic retry.
- [x] Cancel is an explicit remote-stop operation only. Timeout, `op_close`, plugin disposal, or bridge failure never invokes it implicitly. Unconfirmed stop remains unknown.
- [x] Provider lifecycle IDs are preserved for correlation. The bridge never infers completion from idle state, the last assistant message, or another contributor's response.
- [x] Visibility, multiplayer TTL, participant roster, identity synthesis, archive/delete, and human-only approvals remain unavailable.
- [ ] Security review, deterministic contract tests, and a user-approved **Orb** scratch deployment pass before claiming full delivery. The local scratch deployment and deterministic tests pass; the Orb deployment is blocked until the provider loads a project-scoped plugin.

## Out of scope

Visibility changes, multiplayer enable/disable, workspace administration, participant attribution, automatic retries, private HTTP/WebSocket APIs, permanent webhooks, and deployment to a team thread. The project/Orb plugin is opt-in and must be separately configured with an exact allowlist and short-lived credential.

## Evidence

User selected the narrower **work controls only** scope: bounded reads, append/steer, and explicit cancel. Visibility and multiplayer access changes are excluded. Implementation follows completed todo 023's least-authority design and preserves the common `op_*` interface.

`vendor/amp-plugin/pi-strings-bridge.ts` provides the project-scoped provider plugin. `extensions/pi-strings/runtime/amp-plugin-bridge.ts`, `Coordinator`, and `extensions/pi-strings/index.ts` expose `op_observe`, `op_append`, `op_steer`, and `op_cancel_remote`. The bridge uses a provider-supported portal URL, exact T-ID allowlist, bearer token, bounded recent-message API, and explicit unknown-delivery handling. Native `op_send` remains the user-attributed contribution path; no private Amp HTTP/WebSocket API is used.

Deterministic tests pass in `tests/amp-plugin-bridge.test.ts` and `tests/amp-controls.test.ts`. A user-authorized local Amp scratch deployment proved observe, append, steer, and cancel end to end. A scratch Orb `T-01a0f2f6-3484-74ff-ad08-97572bdb46e9` was opened through the native adapter and a native `op_send` rendered as an ordinary `## User` message. A no-project Orb scratch plugin attempt reached the provider portal but returned `502: sandbox is running but port is not open`; the workspace plugin was not loaded. Full plugin delivery therefore remains blocked on a recognized Amp project-scoped plugin deployment, not on the native contribution path or pi-strings control contract.
