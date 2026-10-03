---
status: ready
issue_id: "026"
tags: [pi-strings, native-opening, codex]
dependencies: ["020"]
forked_from: "018"
---

# Open and continue an existing native Codex thread

## Outcome

Codex creation and native-thread opening both work through the common `op_*` tools with preserved identity, settings, and workspace.

## Context

[Unified contract and pinned sources](../../pi-delegate/docs/NATIVE_SESSION_OPENING.md). Published codex-acp 1.1.5 uses the native thread ID in ACP `loadSession`/`resumeSession`, but passes cwd/config/model-provider to `threadResume`. pi-strings currently sets Codex worker mode on ensure. Neither path proves preserved native policy without a live check. Provider-specific logic stays in the adapter/ACPX path.

## Acceptance criteria

- [ ] Independently create a scratch Codex thread, capture ID/settings/workspace, then open/read/continue that exact thread through `op_*`; no prior coordinator or adapter mapping required.
- [ ] Preserve native model/mode/workspace and effective permission policy on initial open and reconnect; do not replay worker defaults. Resolve any upstream gap through a versioned adapter change, not a parallel coordinator.
- [ ] Unknown IDs reject without threadStart/fork/fallback; ID scope conflicts and native mismatch reject. Record deployed adapter version.
- [ ] Demonstrate disconnect independently from explicit cancel; acknowledge locally running executor consequences and forbid unsupported concurrent takeover. No archive/delete on close.
- [ ] New-contract regressions, existing package checks, and real authorized scratch smoke pass with bounded, redacted evidence.

## Out of scope

Arbitrary active user threads or permission changes. A scratch target and approved inference are required for live acceptance; source inspection is not a pass.

## Evidence

Pending; starts after 020 closes on main.
