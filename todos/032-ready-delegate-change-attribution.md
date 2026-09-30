---
status: ready
issue_id: "032"
tags: [pi-delegate, attribution, shared-checkout]
dependencies: []
---

# Delegate results list only files changed by that child

## Outcome

A delegate result's `changed` list contains files attributable to that run, not unrelated files another session changed concurrently in the shared checkout.

## Context

- Fresh reviewers repeatedly reported unrelated todo and pi-strings files as their changes because another session edited the same checkout while they ran.
- A final `git status` snapshot can describe the checkout, but it cannot prove which process changed a path.
- Attribution must remain factual. Do not guess ownership from timing or branch location.

## Acceptance criteria

- [ ] Record the child's baseline and child-attributable file operations/content changes
- [ ] Files already dirty at child start are not attributed unless the child actually changes their content
- [ ] Concurrent edits by another process are excluded from the child's `changed` result
- [ ] Child edits through `edit`/`write` are attributed exactly; bash-created changes are either proven or explicitly reported as unattributed
- [ ] A shared-checkout integration test runs two disjoint writers and verifies each result lists only its own paths
- [ ] Cancellation, timeout, and crash recovery preserve the same attribution evidence
- [ ] Attribution adds no filesystem-wide polling loop

## Out of scope

- Preventing concurrent writes; existing ownership rules remain separate
- Reconstructing ownership for historical runs without evidence

## Evidence
