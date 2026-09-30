---
status: complete
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
- [x] Inventory all22 named integrations; source-backed native-opening evidence for9 and explicit unverified status for13. Record identity, settings, history, concurrency, and disconnect gaps separately from live proof; route remaining investigation to030 without dropping providers.
- [x] Record the unified tool/session contract and provider-specific adapter gaps; reuse the existing integration surface rather than split extensions.
- [x] Replace the superseded ADR with the unified contract; define independently verifiable delivery slices020/026–030 and review authority/concurrency changes fresh.
- [x] Identify unsupported assumptions and exact scratch-Orb/second-participant prerequisites; no guessed API or unsupported success claim.
- [x] Record the user-approved unified direction and explicit safe authority defaults: no implicit stop, settings change, takeover, or resend on open. No packaging fork remains. Evidence contains command outcomes and fresh review findings; live mutations remain separately authorized.

## Out of scope

Production changes, remote contributions, plugin installation, permission changes, or claiming local-client probes prove Orb attachment. Design and provider capability investigation precede implementation; revise 020–024 before executing their earlier Amp-only plan.

## Evidence

Closed by user-approved main-branch commit `382b9e9` (`docs(strings): define unified native session opening`). This closes the decision/proof slice, not production native-opening support. No push performed.

- [Unified contract/matrix](../pi-strings/docs/NATIVE_SESSION_OPENING.md) supersedes the separate-extension ADR. Three Codex-2 Luna recon lanes investigated internal/primary/registry adapters; source links and exact versions are in the matrix. 13 providers remain unverified, explicitly tracked by030.
- `npm run check` baseline:96 pass,19 skipped,0 fail. Skipped live-provider/worktree cases are not claimed passed; no production behavior changed.
- Current Coordinator rejected synthetic external T-ID with `RESUME_PROVENANCE_UNKNOWN`, runtime calls0. Actual ACPX subprocess fixture loaded an externally seeded exact ID and rejected unknown ID without creating.
- `node scripts/probe-native-pi-opening.mjs` exit0 on Pi0.99.1: isolated synthetic native transcripts, no prompt; exact native ID/mapping, original entries preserved, exact unknown-session error(-32602), one native JSONL across the session tree. Recorded thinking off remained byte-identical; absent thinking gained default high. Initial blanket byte-identical predicate failed and was narrowed honestly. Idle close only, not active shared execution.
- Fresh Codex-2 Astra architecture/probe review `reviewer-610408d9-9283-4215-9fde-93a9aabe7cda`: accepted. P2 probe specificity corrected (exact error plus recursive native inventory), parent reran successfully, reviewer verified syntax/source. Active disconnect/provider proof gates remain.
- [Earlier Amp ledger](../pi-strings/docs/2026-09-29-AMP_PARTICIPANT_BOUNDARY.md): CLI0.0.1790712063-gb89205 capability-only probe exit0, lookup exposed, user-present false(null or missing); no thread method invoked. No authenticated bounded Orb read is claimed.
- Cleanup: final `pgrep -fl 'pi-strings-native-pi-probe-'` found no process; experiment deletes only its isolated temp roots.
- Revised020–024 and filed026–030; session todos mirror the dependencies. No production, Orb contribution, plugin deployment, or permission change performed.
