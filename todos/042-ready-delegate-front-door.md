---
status: ready
issue_id: "042"
tags: [pi-delegate, delegation, dispatch]
dependencies: ["040", "041"]
forked_from: "039"
---

# Dispatch delegate through Pi or ACP backends

## Outcome

`delegate` is the user-facing entry point for both backends. Current in-process Pi behavior is the unchanged default, and ACP/provider selection is explicit.

## Context

The pi-delegate extension assumes an in-process Pi child; its run log, role resolution, model approval and Agents frame must stay intact for `pi`. The `acp` backend calls the Coordinator moved in by 041, using the contract from 040.

## Acceptance criteria

- [ ] `delegate` calls with no backend behave exactly as before; the existing suite proves it.
- [ ] A caller can select `acp` plus agent, model, cwd, timeout and task.
- [ ] Output shows the backend and session evidence without low-level noise.
- [ ] Unknown backends and agents, and fields a backend does not support, fail explicitly.

## Out of scope

Lifecycle mapping (043), native Amp semantics (044), removing pi-strings (053).

## Evidence

Closing commit `a9cf815`. Run with real npm on that tree: typecheck clean; 233 tests, 214 pass, 0 fail, 19 skipped (E2E-gated). That is 225 − 3 deleted bridge tests + 11 new in `test/acp-dispatch.test.ts`. `check:install` PASS; pi-tether 148/148.

Real CLI load (pi 0.99.2, isolated HOME):
- Registers `delegate`, `delegate_ctl`, `todo` plus 8 shim `op_*` tools.
- An ACP open of a fake-Amp T-ID returns an idle run.
- `op_list` sees delegate's worker, so there is one shared Coordinator.

Only Coordinator construction: `src/acp/instance.ts:51`.

Gaps handed to 043:
- ACP runs live in an in-memory registry and are force-closed on non-reload shutdown. Opened ones only disconnect. They don't survive the parent process, unlike pi runs.
- Created turns report delivery `unknown`, because the Coordinator records delivery only for opened sessions.
- Multi-run wait is ACP-only.
