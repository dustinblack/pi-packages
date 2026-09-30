---
status: ready
issue_id: "024"
tags: [pi-strings, amp]
dependencies: ["022"]
forked_from: "018"
---

# Hand off approved evidence between selected Amp threads

## Outcome

Pi coordinates independent work by sending only approved evidence to an explicitly selected destination, preserving its source and access boundary.

## Context

Cross-thread messages do not copy workspaces, files, or commits. Use the common `op_*` / Amp adapter path proven by 029–022. Conditional 023 is a dependency only if a concrete native capability gap requires it and the plan is explicitly updated.

## Acceptance criteria

- [ ] Source and destination identities are explicit; selected content and destination are approved before disclosure.
- [ ] Each handoff carries source thread/message references, bounded selected evidence, and honest file/commit transfer status.
- [ ] Two authorized scratch threads show correct destination, attribution, provenance, and no transcript broadcast or duplicate send on uncertain failure.
- [ ] New-contract tests, existing checks, real-path smoke, and user-facing examples pass without changing owned ACP workers.

## Out of scope

Requires two approved targets before live disclosure. No automatic thread creation, file copying, private-history broadcast, recursive task scheduler, or Space media automation.

## Evidence

Pending; work starts after 022 closes on main.
