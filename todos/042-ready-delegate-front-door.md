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

Pending implementation.
