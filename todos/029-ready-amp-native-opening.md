---
status: ready
issue_id: "029"
tags: [pi-strings, native-opening, amp]
dependencies: ["020"]
forked_from: "018"
---

# Create local or Orb Amp work and open an exact native thread

## Outcome

The Amp integration uses the same `op_*` tools to create local/Orb sessions or open a selected native `T-...` thread, preserving its existing executor and authority.

## Context

[Unified contract](../pi-strings/docs/NATIVE_SESSION_OPENING.md) and [Amp research](../pi-strings/docs/AMP_PARTICIPANT_COORDINATION.md). amp-acp 0.10.0 advertises execution-environment local/orb but load/resume requires an existing S-to-T mapping. Implement arbitrary native-ID admission and metadata in a versioned provider adapter, surfaced through ACPX; no separate CLI coordinator or Amp tool family. Current native CLI history exports are unbounded; plugin capability probe exposed lookup but no authenticated user identity.

## Acceptance criteria

- [x] Common creation path accepts the advertised execution option and proves both local and Orb scratch creation. Existing-thread path accepts the exact native T-ID without prior S mapping and verifies service/account/thread identity.
- [ ] Opening preserves the target's local/Orb executor/settings; rejects explicit executor/model overrides and invalid/inaccessible/changed-scope targets without fallback to latest or new thread.
- [ ] Selected existing local and Orb threads expose bounded state/history. Initial empty/disconnected activity is unknown, not idle; no prompt, executor takeover, permission change, archive, or cancellation during observation.
- [ ] Disconnect, timeout, shutdown, and reload release only the permitted local resources. Prove remote non-mutation for idle observation; report local active-executor limitations honestly. Explicit stop remains separate.
- [ ] Adapter `is_error` cannot become successful completion because transport exits normally. Exposed Amp model options use the advertised config key, not an assumed literal `model`.
- [ ] New-contract tests and package checks pass; approved create/open/read/disconnect real-path smokes record native identity and preserved executor. Continued contribution is 021, not inferred from read success.

## Out of scope

Sending to existing threads before 021's target/message approval; arbitrary Orb creation costs; live team-thread probes; plugin deployment; visibility/multiplayer changes. If authenticated bounded reads cannot be supplied natively, record the exact gap for conditional 023 rather than silently loosening acceptance.

## Evidence

Implementation slice is present in the common ACPX path: `vendor/amp-acp/src/index.ts` builds the local adapter, `op_spawn` selects local/Orb creation, and exact native `T-...` opening verifies authenticated `amp threads export` metadata for scoped ID, owner, cwd, executor, and mode without replaying transcript messages. `tests/native-amp.test.ts` exercises local creation, Orb creation, exact local/Orb opening, duplicate admission, disconnect metadata, and provider `is_error` failure handling. `npm run typecheck`, `npm run build`, and the focused Amp test pass.

Read-only live Orb probe completed against the user-authorized `T-01a0efc0-bad3-7153-8a89-37d9c005d36c`: exact native ID, owner scope `user_01KBDDVEH7H3DNNJBBXR14061B`, executor metadata `sandbox` mapped to Orb, and mode `high` were returned; no prompt, cancellation, archive, or setting change was issued; `op_close` disconnected the local adapter. The provider reported the remote disconnect effect as unknown, so no remote-survival claim is made.

A user-authorized scratch Orb creation completed through the common path on `T-01a0f0e5-49d7-70fc-a166-70a79b15df96` (ACP session `S-munp3ekd-9g4yrr`): `executionEnvironment: orb`, one approved marker request `req_106d4160-49ab-4e91-8a2f-11d65e71d375`, `status: completed`, one attempt, no repository or external action, then `op_close`. A subsequent read-only exact-ID reopen returned account scope `amp://account/user_01KBDMQ2KMKD7B3EP7XE7X4V2Y`, cwd `/Users/ssweens/src/pi-packages/pi-strings`, executor `orb`, mode `medium`, and `disconnectEffect: unknown`; status and close completed without a prompt.

A user-authorized local scratch creation completed through the common path on `T-01a0f0f7-87ef-7738-bf6f-240f547b7399`, using a temporary workspace and request `req_bac16f09-fc82-45cc-b1fa-c2c742f5d090`: `executionEnvironment: local`, `status: completed`, one attempt, no repository or external action, then `op_close`. Status exposed account scope `amp://account/authenticated`, the temporary cwd, mode `medium`, and `disconnectEffect: stops-local-executor`.

A local native-open probe exposed an unsafe fallback when the provider export omitted the original workspace: the adapter could use Pi's current cwd as if it were verified. The adapter now fails with `NATIVE_LOOKUP_FAILED` instead. The fake-provider regression covers the missing-cwd case, and the full package check passes.

Still open before completion: native mode/settings preservation during a contribution, active-turn/disconnect semantics, and bounded observation. Amp owns multiplayer attribution; it is not a pi-strings acceptance gate. Live mutation cases require explicit scratch targets and permission.
