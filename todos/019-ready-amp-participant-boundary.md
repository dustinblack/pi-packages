---
status: ready
issue_id: "019"
tags: [pi-strings, amp, decision]
dependencies: []
forked_from: "018"
---

# Define unified creation and native-thread opening across providers

## Outcome

A reviewed unified session contract supports creating new and opening existing sessions for each supported provider, with a source-backed capability matrix and concrete adapter-gap delivery slices.

## Context

User clarified that all agent integrations must open existing provider-native threads, not just Amp. No separate Amp extension/tool family. [Research](../pi-strings/docs/AMP_PARTICIPANT_COORDINATION.md) supplies Amp evidence; its earlier packaging proposal is superseded. `Coordinator` currently assumes owned work, decorates prompts, cancels on deadlines/shutdown, and rejects unknown resume provenance. Evolve these policies explicitly for opening external sessions while preserving owned-worker guarantees. Existing local/Orb execution is separate from create/open-existing and authority. No arbitrary remote mutations authorized.

## Acceptance criteria

- [x] Verify available native read-only commands, service/account identity evidence, bounded-history options, and passive activity semantics with actual CLI probes; document unsupported guarantees rather than infer them.
- [ ] Inventory supported provider adapters: native IDs, creation, arbitrary existing-session opening, executor preservation, history, concurrency, cancellation/disconnect; cite source and separate live proof.
- [ ] Record the unified tool/session contract and provider-specific adapter gaps; reuse the existing integration surface rather than split extensions.
- [ ] Replace the superseded ADR and define independently verifiable provider delivery slices; review authority and concurrency changes fresh.
- [x] Identify unsupported assumptions and exact scratch-Orb/second-participant prerequisites; no guessed API or unsupported success claim.
- [ ] Resolve remaining session-authority semantics with the user; packaging separation is rejected, not an open question. Evidence contains command outcomes and review findings.

## Out of scope

Production changes, remote contributions, plugin installation, permission changes, or claiming local-client probes prove Orb attachment. Design and provider capability investigation precede implementation; revise 020–024 before executing their earlier Amp-only plan.

## Evidence

Uncommitted evidence; no closing SHA exists. [Proposed ADR and command ledger](../pi-strings/docs/2026-09-29-AMP_PARTICIPANT_BOUNDARY.md) contains parent-run list/account/top/help probes and the approved capability-only script result. CLI `0.0.1790712063-gb89205`: plugin probe exit 0, lookup exposed, user-present false (null or missing, not proof of bad credentials); no thread methods called. No matching observer/probe remained after execution. Two Codex-2 Luna scouts completed; the source follow-up found only native binaries in the exact npm distribution. Codex-2 Astra's fresh review accepted the experiment plan and code with no findings, but blocked production pending packaging approval and authenticated bounded-read proof. Subsequently the user rejected packaging/tool-family separation and required native existing-thread opening for all agent integrations. That supersedes the reviewed proposal, not its probe results. Next: provider capability matrix and unified session semantics; no production or Orb proof is claimed.
