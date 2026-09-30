# Amp participant coordination

## Decision status

Research complete; the user approved staged implementation with delegated parallel work. The selected role is **participant/coordinator**: Pi contributes to selected existing Amp threads while humans and Amp remain in control. This is not an autonomous supervisor or a voice/video bot. The durable plan is [todo 018](../../todos/018-ready-amp-participant-coordination.md). The common ACPX path now has a vendored Amp adapter for local/Orb creation and exact T-ID opening; live authenticated account, executor-preservation, and mutation proofs remain gated.

The [unified native-opening contract](NATIVE_SESSION_OPENING.md) supersedes the separate participant-extension proposal: every agent integration must support creating new sessions and opening existing provider-native threads through the same tool surface. Amp local/Orb execution is a provider configuration choice. Investigate and extend adapter capabilities first; preserve explicit lifecycle authority rather than treating every opened thread as a Pi-owned worker. CLI/plugin research below remains evidence, not a decision to bypass ACP or deploy another extension.

Research used Amp CLI `0.0.1790692375-ga7bdff`, published SDK `0.1.0-20260918210405-g81edbf0`, and `amp-acp` source at commit `e35216d4fd3258445ac8b3ac5db7ef4ce3a40af9` (package version `0.10.0`). Public documentation can change independently of these versions.

No remote prompts, multiplayer changes, account changes, plugin installations, or agent launches were performed. Read-only commands used the existing CLI authentication. No private thread contents or credentials are included here.

## The objects are different

| Object | What it owns | Implication for Pi |
| --- | --- | --- |
| Amp thread (`T-...`) | Conversation and durable work identity | Bind to the exact thread ID, scoped to the Amp service and authenticated account. |
| Orb | Remote execution environment for a thread | Sending a message must not move execution onto Pi's machine. |
| Multiplayer | Permission for teammates to contribute and access the execution environment | Read access does not prove contribution or owner access. |
| Space | Voice/video/screen-sharing call attached to a thread | Separate from both the Orb and agent messaging; not required for text coordination. |
| ACP session (`S-...` in amp-acp) | Adapter session mapped to an Amp thread | Not interchangeable with a `T-...` ID. |
| pi-strings worker | Coordinator-owned session, policy, request lifecycle, and cleanup | Its authority does not extend to an externally owned shared thread. |

Multiplayer grants workspace members access to prompts, files, portals, terminal, and secrets in the shared execution environment. Costs are billed to the thread owner. Spaces can be joined by thread viewers without enabling multiplayer. See [Multiplayer][multiplayer] and [Space][space].

The documentation differs on whether enabling multiplayer first shares a private thread automatically. The SDK and installed CLI require a shared thread. An integration must inspect permission failures and ask before changing visibility; it must not silently resolve this difference by broadening access.

## Capability map

**Verified** means executed locally without sending an agent prompt. **Documented** means confirmed in official documentation or source, not exercised against a shared Orb.

| Operation | Surface | Evidence and limits |
| --- | --- | --- |
| List own threads | `amp threads list --json --limit N` | Verified. Returns IDs, titles, update times, and other metadata. |
| Search accessible threads | `amp threads search '<query>' --json` | Verified with own-thread filters. Search supports exact IDs, parents, repositories, authors, and dates. Cross-user contribution was not tested. |
| Observe active thread summaries | `amp top --stream-jsonl` | Verified. Emits snapshots; CLI labels its schema EXPERIMENTAL. Not a transcript subscription or completion receipt. |
| Read an existing conversation | `amp threads markdown <T-ID>`; `amp threads export <T-ID>` | Verified on one owned local-client thread. JSON export permissions are narrower than general viewing. Do not equate this with live Orb attachment. |
| Send to an existing Orb | `amp threads continue <T-ID> -ox '<message>'` | Documented. Runs on the thread's existing remote executor; returns a URL before work completes. |
| Send and stream output | Same command plus `--stream-json` | Documented. This is a sending operation, not a passive watch command. |
| Continue through SDK | `execute({ prompt, options: { continue: threadId, executor: 'orb', noArchiveAfterExecute: true } })` | Documented and verified in SDK source. Spawns the Amp CLI; not a separate network transport. |
| Enable/disable multiplayer | `amp threads share multiplayer on/off/ttl`; SDK `threads.setMultiplayer(...)` | Help and API verified, operation not run. SDK documents owner-only management. |
| Read and observe an exact thread from a plugin | `amp.threads.get(threadID).messages(...)`, `.state.get()`, `.state.subscribe(...)` | Present in installed Plugin API and public reference. Requires a plugin host; not a standalone external SDK function. |
| Queue or steer from a plugin | `.appendUserMessage(message, { steer: true })` | Documented. Steering prioritizes the queued message at the next dequeue point; not instantaneous interruption. |
| Wait from a plugin | `.waitForResponse({ timeoutMs })` | Documented thread-state wait, not per-message response correlation. |
| Stop remote work | Plugin `.cancel()` | Explicitly stops the thread's current turn. Not appropriate for detach or routine Pi shutdown. |
| Lifecycle evidence | Plugin `agent.start` / `agent.end` | Expose the triggering message ID; `agent.end` includes status and messages. Candidate for correlation, not yet proven across concurrent contributors. |
| Delegate within Amp | Native agent-to-agent tools; plugin `Agent.createThread(...)` | Documented. Child threads have independent workspaces; messages do not transfer files or commits. |
| Voice/video Space participation | Web/app controls | No supported bot/media API found in the inspected CLI, SDK, plugin reference, or External API schema. This is a research limit, not proof that no internal API exists. |

### Verified read-only probes

- `amp threads list --limit 3 --json`: returned three thread records.
- `amp threads search 'author:me after:7d' --limit 3 --json`: returned three records.
- Repository-filtered search for the amp-acp upstream returned no records; no attachment was inferred from that absence.
- `amp top --stream-jsonl`: observed an initial empty snapshot and then two thread summaries within ten seconds. Top-level fields: `updatedAt`, `threads`, `reconnecting`. Thread fields included `id`, `title`, `url`, `project`, `status`, `updatedAt`, `working`, and `executorConnected`. The observer process was terminated and reaped.
- One selected owned thread exported 816 messages. Observed message fields included `messageId`, `protocolMessageID`, and `protocolMessageVersion`. These are observed export fields, not a promised stable public contract.
- That thread's metadata reported `executorType: local-client`, private visibility, and no multiplayer expiry. Its markdown export was nonempty and 3,566,789 characters long. No transcript was retained in this repository.
- The complete public OpenAPI path set exposes thread list, message read, usage read, and thread deletion. It contains no thread-send, thread-event-stream, Orb-control, multiplayer, or Space endpoint.

A full transcript export is too large to inject into Pi on every update. Prefer bounded recent-message reads where supported; preserve IDs and provenance when summarizing. An initial empty status snapshot is not proof that nothing is running.

## Three integration paths

### 1. Native CLI/SDK: provider-adapter building blocks

The documented remote continuation command is:

```sh
amp threads continue <exact-thread-id> -ox \
  '[Pi coordinator] <approved contribution>' \
  --stream-json --no-archive-after-execute
```

This example was not run. In implementation, invoke a fixed executable with an argument array and send prompt text over stdin rather than interpolating shell text. Never substitute the latest thread for an explicit ID.

For an existing Orb, Amp documents that `--mode`, `--project`, and `--orb-size` are ignored: the thread keeps its existing settings. Local skills, MCP servers, and tool permissions are not transferred into the Orb. Configure those on the Amp project instead.

Advantages: existing user authentication, exact native IDs, no adapter mapping, no plugin deployment for basic reads and sends.

Limits:

- Remote SDK execution accepts string prompts, not streaming input. Local `steer` and `requestId` streaming-input guarantees do not automatically apply to Orb sends.
- No remote-send idempotency guarantee was found. After an ambiguous transport failure, record delivery as unknown and reconcile; do not automatically resend.
- SDK abort signals terminate the local CLI subprocess. The reviewed source does not establish whether that stops remote work. Do not report remote cancellation from a local process exit.
- A streamed result in a busy multiplayer thread needs a correlation experiment before Pi can claim it answers Pi's message.
- `amp top` gives activity snapshots, not authoritative message delivery, contributor presence, or a durable event cursor.

### 2. Amp plugin: richer coordination if required

The installed Plugin API exposes these native operations:

```ts
const thread = amp.threads.get(threadID)
await thread.state.get()
await thread.messages({ from: 'end', limit: 20 })
const subscription = thread.state.subscribe(state => { /* consume observation */ })
subscription.unsubscribe()
```

These calls run inside Amp's plugin host. A Pi integration needs a defined bridge to that host; importing `@ampcode/plugin` alone does not supply a live connection. No plugin bridge was installed or tested during this research.

Useful contracts:

- `state`: `idle`, `running`, `awaiting-approval`, or `error`. Automatic inference retries remain `running`.
- `messages`: defaults to the inference-visible history, including compaction summary; use `full: true` for compacted-away messages. Maximum page size is 20.
- `appendUserMessage`: accepts explicit steering preference but returns `Promise<void>`, not a message receipt.
- `waitForResponse`: waits for running/awaiting-approval to return to idle and returns the last assistant message. [INFERENCE] Concurrent human turns can make that an unsafe substitute for request-specific completion.
- `agent.start` and `agent.end`: carry the triggering message ID. [INFERENCE] A target-side plugin can help establish request lineage, but whether and where it must run needs a live experiment.
- Human-required approval dialogs remain human-required. A coordinator must not answer them by impersonating a contributor.

An Orb plugin can register a durable webhook that wakes the Orb. This is optional, not a prerequisite for a desktop participant. Webhook delivery is at least once and not strictly ordered; HTTP 200 means queued, not completed. Webhook URLs are credentials. Do not add a webhook or permanent service before the basic participant workflow demonstrates a need.

### 3. External REST API: not the execution control plane

The [External API][external] is for workspace data and administration. Its own introduction directs product integrations to CLI/SDK. M2M thread listing includes private/group-shared workspace threads and requires separate workspace application credentials.

Do not request workspace-wide credentials merely to join selected threads. No public send, steering, or Space-media endpoint was found in the full inspected schema. Do not build against guessed private HTTP/WebSocket routes.

## Why existing pi-strings cannot just adopt the thread

Source evidence:

- [`Coordinator.spawn`](../extensions/pi-strings/orchestration/coordinator.ts) rejects a resume ID without coordinator-owned provenance (`RESUME_PROVENANCE_UNKNOWN`). Keep this protection for owned workers.
- [`WORKER_CONTRACT`](../extensions/pi-strings/domain/roles.ts) tells every worker not to coordinate other agents, install dependencies, change branches, or stop services. `decoratePrompt` always appends it. Injecting it into shared Amp conversations would impose unrelated restrictions on someone else's work.
- `Coordinator.shutdown`, deadlines, and forced close cancel/close owned work. A participant's disconnect must not grant that authority over shared work.
- [`AcpxRuntimePort`](../extensions/pi-strings/runtime/acpx-runtime.ts) forwards model settings and normal prompt turns, not the native Amp collaboration API.
- The current [coordination layers](2026-08-02-COORDINATION_LAYERS.md) deliberately exclude in-flight steering, recursive coordination, and a second production runtime. The unified contract extends the existing Coordinator with origin/lifecycle policy; it does not introduce a second runtime.

The upstream `amp-acp` source creates an `S-...` session with no arbitrary native thread admission; resume/load requires an existing durable mapping. pi-strings now uses a vendored adapter that verifies an authenticated `amp threads markdown T-...` lookup and continues the exact T-ID through the installed CLI, while intentionally avoiding transcript replay. See [session creation and loading][adapter-sessions] and [native lifecycle][adapter-lifecycle].

Two additional issues must be addressed in the retained ACP integration:

1. Non-auth `result.is_error` is emitted as text and the prompt can still return `end_turn` if transport ends normally. A coordinator must not treat this as successful execution. This is source evidence, not a reproduced provider failure. See [error handling][adapter-errors].
2. Amp advertises model-category option `amp-mode`, while pi-strings' existing-worker model change requests literal key `model`. The vendored generic setter does not alias that key. The earlier blanket claim that all Amp mode changes already work through pi-strings was too broad; creation-time selection and later changes are different paths.

## Amp participation requirements

These are unshipped behavioral requirements behind the existing `op_*` surface. Packaging is settled: one provider integration, not another extension or tool family. The unified contract governs public API and lifecycle policy.

- **Discover:** list/search within the authenticated user's accessible scope. Do not enumerate private workspace content through admin credentials by default.
- **Attach:** select an exact service/account/thread identity and verify readable metadata. No prompt, executor takeover, model change, or visibility change.
- **Observe:** read bounded recent messages and current activity. A stale or disconnected observation is unknown, not idle or failed remote execution.
- **Contribute:** send a scoped, visibly attributed Pi message after user authorization. Do not claim a separate authenticated Pi identity when using the user's account.
- **Handoff:** send selected evidence with source thread/message IDs. Cross-thread content transfer is explicit; do not broadcast private thread history.
- **Detach:** stop only Pi's observation and local resources. Do not cancel, archive, or delete the Amp thread.
- **Manage:** cancellation, multiplayer changes, visibility changes, and remote environment changes require separate authority. They are not consequences of timeout or cleanup.

Keep three facts separate: Pi's local operation state, evidence of message acceptance, and the remote thread's activity. A local deadline is not a remote failure. An idle thread is not proof that Pi's requested task succeeded.

Serialize Pi's own submissions per thread, but do not mistake that local serialization for a lock against humans or other clients. Avoid automated retries of uncertain sends. Choose queue-versus-steer explicitly once the transport proves it can preserve that choice.

## Implementation sequence and proof gates

1. **Read-only participant.** Bind a selected existing Orb and read bounded state/history; detach without affecting it. Prove exact-ID preservation, account scope, and no new prompt or executor attachment. Current probes prove CLI reads only; this Orb-specific gate is still open.
2. **One approved contribution.** In an owner-approved scratch Orb, send a unique marker and observe both CLI and web evidence. Prove the same remote thread processes it, no local executor is registered, and remote settings remain unchanged.
3. **Multiplayer race and disconnect.** Have a human send another message while Pi contributes. Prove correct attribution and request/result lineage. Stop Pi's observer and restart Pi while Amp continues. Test ambiguous delivery without duplicating the message. A second authorized participant is needed for the cross-user permission case.
4. **Richer plugin bridge, only if needed.** Prove native state subscription, explicit steering, and lifecycle correlation with the target thread. Confirm permission expiry fails closed and human-only approvals remain human-only. Specify host placement, authentication, and disposal before deployment.
5. **Cross-thread handoff.** Transfer only approved evidence between two selected threads and verify provenance and file-transfer semantics. Do not infer that sending a thread link copied its files or commits.

Implementation starts with the common create/open contract and Pi vertical slice (020), then Amp native admission/observation (029), then these contribution gates (021–024). The Amp adapter slice is implemented; live provider evidence is still required before closing 029. Provider-specific capabilities live in the adapter and flow through ACPX. Preserve existing owned-worker behavior while adding explicit opened-session policy to the same Coordinator.

## Remaining uncertainties

- Cross-user CLI/SDK write authorization for an already-active multiplayer thread.
- Exact busy-thread queueing and streamed-result correlation for `-ox` continuation.
- Remote behavior when a streaming CLI is interrupted or loses its connection.
- Stable passive transcript streaming outside the plugin host.
- Native message receipt/idempotency for remote sends; the plugin append API also returns no receipt.
- Whether plugin state/history reads across threads require any executor attachment or wake, and the least-privilege bridge deployment location.
- Supported Space media/bot APIs; none found in the inspected public interfaces.

These are live acceptance gates, not promises inferred from interface names. The next mutation-bearing experiment requires a user-approved scratch Orb and message; it must not run against an arbitrary active team thread.

[threads]: https://ampcode.com/docs/threads
[multiplayer]: https://ampcode.com/docs/collaborate/multiplayer
[space]: https://ampcode.com/docs/collaborate/space
[remote]: https://ampcode.com/docs/cli/spawning-orbs
[sdk]: https://ampcode.com/docs/sdk/typescript
[sdk-source]: https://unpkg.com/@ampcode/sdk@0.1.0-20260918210405-g81edbf0/dist/index.js
[plugins]: https://ampcode.com/docs/plugin-api
[agent-to-agent]: https://ampcode.com/docs/orbs/agent-to-agent
[webhooks]: https://ampcode.com/docs/orbs/event-driven
[external]: https://ampcode.com/api/external
[openapi]: https://ampcode.com/api/v2/openapi.json
[adapter-sessions]: https://github.com/tao12345666333/amp-acp/blob/e35216d4fd3258445ac8b3ac5db7ef4ce3a40af9/src/server.ts#L301-L428
[adapter-lifecycle]: https://github.com/tao12345666333/amp-acp/blob/e35216d4fd3258445ac8b3ac5db7ef4ce3a40af9/README.md#L108-L126
[adapter-errors]: https://github.com/tao12345666333/amp-acp/blob/e35216d4fd3258445ac8b3ac5db7ef4ce3a40af9/src/server.ts#L562-L600

## Primary references

- [Threads][threads], [remote Orb execution][remote], and [SDK reference][sdk].
- [Published SDK implementation][sdk-source]: `execute`, `buildCliArgs`, `spawnAmpCli`, and `killProcess`.
- [Plugin API][plugins]: `PluginThread`, `AppendUserMessageOptions`, `AgentStartEvent`, and `AgentEndEvent`. Cross-checked against installed `amp plugins show-docs`.
- [Agent-to-agent coordination][agent-to-agent] and [webhook guarantees][webhooks].
- [Full public OpenAPI schema][openapi], queried for its complete path set rather than inferred from a truncated page.
