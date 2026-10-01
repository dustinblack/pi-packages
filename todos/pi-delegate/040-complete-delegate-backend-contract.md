---
status: complete
issue_id: "040"
tags: [pi-delegate, acpx, contract]
dependencies: ["039"]
forked_from: "039"
---

# Define the backend-neutral delegation contract

## Outcome

One written contract for `delegate`/`delegate_ctl` inputs, run identity, result shape, backend selector and failure semantics, shared by in-process Pi and ACP workers. It also decides what happens to each of the 12 `op_*` capabilities.

## Context

- `pi-delegate/src/index.ts`: `Run` record (~69–133), `delegate` (~1176–1315), `delegate_ctl` status|result|wait|steer|cancel (~1336–1512). The `pi` backend is the current behavior.
- pi-strings (moving in under 041): `domain/types.ts` `RuntimeHandle` (backend/runtime/session/native IDs), `RequestRecord` (request ID, status, delivery, provider outcome), `AmpControlRecord`; `orchestration/coordinator.ts` serialized `execute` seam with spawn/send/wait/result/cancel/close.
- `op_*` today: spawn, status, send, observe, append, steer, cancel_remote, wait, result, list, cancel, close. Each one maps to a `delegate`/`delegate_ctl` field or action, or is dropped with a reason. No `op_*` tool survives as a tool (053).
- One package, one Coordinator, so there is no cross-package lookup or lock question.

## Findings

Draft `op_*` mapping (proposal; the bridge rows wait on the user):

| op_* | New home | Note |
|---|---|---|
| spawn + first send | `delegate` with `backend:"acp"`, agent, cwd, model, role, `sessionId` (open), `executionEnvironment` | pi-delegate runs a task in one call; ACP create/open + first turn collapse into it |
| send (later turns) | `delegate_ctl steer` | pi-delegate `steer` already means "next turn, same transcript/ID". Opened sessions stay undecorated and are never retried. |
| wait | `delegate_ctl wait` | Needs multi-run `any`/`all` if pi-delegate lacks it; timeout never cancels |
| result | `delegate_ctl result` | Keeps request IDs, delivery, truncation flag |
| status, list | `delegate_ctl status` (with no runId, lists) | Native identity and capabilities go in the ACP view |
| cancel | `delegate_ctl cancel` | Cooperative, with grace, then close |
| close | new `delegate_ctl close` | ACP workers hold processes. Opened sessions disconnect only, never archive or delete. |
| observe | `delegate_ctl status`/`result` on an opened Amp run, using one `amp threads export <T-ID>` per call | On demand only, with no background polling. Export is a full dump (~0.5 s, 35 KB for 14 messages, measured 2026-09-30), so return only messages after the last `messageId` returned; the thread `v`/`updatedAt` mark changes. |
| plugin-steer, append | `delegate_ctl steer` (native send) | Shows as `## User`, not "Message from pi-strings-bridge plugin" |
| cancel_remote | `delegate_ctl cancel` through ACP session cancel | Only for turns this run started. Cancelling a turn someone else started fails explicitly as unsupported. |

Decided 2026-09-30 (user): no plugin bridge and no new verbs. Delete `src/acp/runtime/amp-plugin-bridge.ts`, `vendor/amp-plugin`, the `PI_STRINGS_AMP_BRIDGE_*` config and the bridge tests. Todo 031 is proposed to close as superseded, which is the user's call. Turns this run starts stream live through `--execute --stream-json` (`vendor/amp-acp/src/index.ts:174`), so export is needed only to see other participants' activity.

## Acceptance criteria

- [x] Contract covers create, open-existing (`sessionId`), send/steer, wait, result, status, cancel and close for both backends.
- [x] ACP-only fields (agent, sessionId, executionEnvironment) are explicit and rejected on `pi`. There is no silent fallback from ACP to Pi.
- [x] Run ID, provider request IDs, native ID, delivery and remote outcome stay distinct in the result shape.
- [x] A table maps each of the 12 `op_*` tools to its new home or to "dropped" with a reason.
- [x] A short ADR names the lifecycle and compatibility tradeoffs.
- [x] Type-level or fixture tests pin the contract before backend wiring.

## Out of scope

Moving code (041), provider implementation, real credentials, Orb mutation.

## Evidence

Closing commit `6a77b8b`: `pi-delegate/src/backend.ts` (contract and validators), `test/backend-contract.test.ts` (17 cases, plus compile-time type checks), `docs/adr/0001-delegate-backends.md` (the ADR, with the `op_*` table). Run with real npm on that tree: `npm run typecheck` clean; `npm test` 225 tests, 206 pass, 0 fail, 19 skipped (E2E-gated); before, 208/189/0/19.

Choices made in the contract, which 042 builds on:
- `agent` is required on acp.
- `role` means a role name on pi and `read-only|writer` on acp.
- An opened run may have no task and is then `idle`. The renderer must handle `idle` in 042.
- `context` and steer `restart` are pi-only.
- pi reports open and close as unsupported.
- ACP cancel scope is `own-turns`; `observe` is supported only on opened Amp runs.
- `status(runIds?)` also lists.
- The observed-message shape is left to 044, and Amp `mode` to 058.
