# Amp plugin work controls

Status: provider-backed bridge implemented in `vendor/amp-plugin/pi-strings-bridge.ts` and exposed through the existing `op_*` surface. Deployment remains project/Orb-scoped and opt-in.

## Surface

The bridge accepts one exact Amp `T-...` thread per request:

- `op_observe`: calls `thread.state.get()` and `thread.messages({ from: "end", limit })`. It never requests `full: true`; Amp owns the message-page bound.
- `op_append`: calls `thread.appendUserMessage(...)` without steering.
- `op_steer`: calls `thread.appendUserMessage(..., { steer: true })`.
- `op_cancel_remote`: calls `thread.cancel()` explicitly.

Each request has a Pi-generated `ctl_...` ID, exact thread ID, action, and delivery state. `accepted` means the plugin handler completed the provider API call. It does not mean the remote agent has finished. A timeout, connection loss, malformed callback, or missing response returns `delivery: unknown`; pi-strings never retries automatically.

The bridge does not call visibility, multiplayer, participant, archive, delete, or approval APIs. `op_close`, coordinator shutdown, local timeout, and plugin disposal never invoke `op_cancel_remote` implicitly.

## Deployment

Copy the plugin into the target Amp project as `.amp/plugins/pi-strings-bridge.ts`. Configure the plugin host with:

```text
PI_STRINGS_AMP_BRIDGE_TOKEN=<one-time or short-lived bearer secret>
PI_STRINGS_AMP_BRIDGE_THREADS=<comma-separated exact T-IDs>
PI_STRINGS_AMP_BRIDGE_PORT=<configured port>
PI_STRINGS_AMP_BRIDGE_HOST=0.0.0.0   # Orb; loopback is safer for local-only use
```

Start the plugin's server, expose that port with the provider-supported `amp orb portal <port>`, and configure pi-strings with the resulting HTTPS endpoint and the same bearer token:

```text
PI_STRINGS_AMP_BRIDGE_URL=<full portal URL ending in /control>
PI_STRINGS_AMP_BRIDGE_TOKEN=<same secret>
```

The portal URL is a credential. Use a project/Orb-scoped plugin, an exact thread allowlist, a short-lived token, and a short-lived portal. Do not install this bridge globally or point it at a team thread without explicit authorization.

## Verification

Deterministic tests cover exact request identity, bearer authentication, bounded observation shape, accepted control receipts, invalid configuration, and unknown transport delivery:

```sh
node --import tsx --test tests/amp-plugin-bridge.test.ts tests/amp-controls.test.ts
```

A user-authorized local Amp scratch run loaded the plugin and proved:

- `observe` returned `state: running` plus recent messages while a turn was active;
- `append` returned `delivery: accepted` and the marker was processed;
- `steer` returned `delivery: accepted` and took priority after the active tool was cancelled;
- `cancel` returned `delivery: accepted`, `remoteStop: requested`, and stopped the active wait.

A separate no-project Orb scratch run proved the portal route itself but returned provider `502: sandbox is running but port is not open`; the workspace plugin was not present in that Orb. This is a deployment prerequisite, not a claim that Orb plugin execution is available. A real Orb proof requires a project-scoped plugin loaded into an Amp project recognized by the provider. No persistent plugin or team-thread mutation was left behind.
