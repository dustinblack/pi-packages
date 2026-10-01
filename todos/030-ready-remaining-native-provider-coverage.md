---
status: ready
issue_id: "030"
tags: [pi-strings, native-opening, decision]
dependencies: ["019"]
forked_from: "018"
---

# Resolve native-opening delivery paths for the remaining registry providers

## Outcome

Each of the remaining 17 named integrations has a source/capability-backed native-opening route and its own bounded delivery slice, or an explicit externally blocked prerequisite. None is silently dropped from the user-approved all-provider goal.

## Context

[019's matrix](../pi-delegate/docs/NATIVE_SESSION_OPENING.md) covers 22 named integrations: 21 ACPX registry entries plus Amp. Pi/Codex/Claude/OpenCode/Amp are assigned to 020/026–029. This decision slice covers Gemini, Kimi, Qwen, OpenClaw, cursor, copilot, droid, fast-agent, grok-build, iflow, kilocode, kiro, mux, pool, qoder, trae, zeroclaw. First four have source evidence but no live proof; the last 13 are unverified, not declared unsupported.

## Acceptance criteria

- [ ] Inspect actual deployed/published adapter entry points per provider; record version, canonical native ID/scope, load/resume semantics, settings/workspace recovery, history bounds, cancel/disconnect, and unknown-ID behavior. Capability flags alone are insufficient.
- [ ] For every provider, file an independently verifiable implementation/live-proof child with exact known gaps and prerequisite credentials/installation/scratch permissions. Concrete newly discovered work is pending until user-promoted.
- [ ] Source-missing or closed implementations have a bounded capability/black-box experiment plan, not guessed behavior. No private endpoints, arbitrary user threads, or unapproved installs.
- [ ] Update the hub/matrix so all22 remain accounted for. Unsupported errors do not count as delivered native opening; decision closure does not mean its provider children shipped.
- [ ] Fresh review checks coverage, proof claims, and that each child can execute independently after the common core lands.

## Out of scope

Implementing all17 adapters in one item, removing providers from scope, arbitrary custom-command conformance guarantees, or live mutations without approval. Real delivery remains in the provider children created here.

## Evidence

Source-only reconnaissance alongside 020. Not delivery.

- fast-agent: published ACP `session/load`/`resume` exact-ID lookup with cwd equality and no create fallback; ACP `session/close` is rejected, so disconnect needs adapter process lifecycle. Source: `evalstate/fast-agent` `src/fast_agent/acp/server/{agent_acp_server.py,session_store.py}`.
- kilocode: native HTTP `sessionID` API with `SessionNotFoundError` and interrupt; ACP mapping to that API is not established. Source: `Kilo-Org/kilocode` `CONTEXT.md` and `specs/v2/{api.html,session.md}`.
- mux@0.28.0: ACP transport only; no identifiable native load/resume in the published bundle.
- Cursor docs (`cursor.com/docs/cli/acp`) document ACP `session/load` but not durable native-ID scope.
- Copilot/Droid: public ACP native-open source/docs were not retrievable (Copilot docs 404s / unrelated; Factory-AI/droid 404).
- zeroclaw: downloaded repo has session memory fields, no ACP native lifecycle.
- Gemini/Kimi/Qwen/OpenClaw remain at the 019 pinned-source gaps; OpenClaw close still cancels.
- Remaining: grok-build, iflow, kiro, pool, qoder, trae still need public-source retrieval. No live/authenticated probes were run.
