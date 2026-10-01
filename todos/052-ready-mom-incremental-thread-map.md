---
status: ready
issue_id: "052"
tags: [mom, graph, thread-map]
dependencies: []
forked_from: "050"
supersedes: []
---

# Apply thread-map state diffs to incremental Mom updates

## Outcome

Every Mom graph update—short live batch or cold chapter—uses one maintainable, evidence-linked state/diff method instead of turning individual events into graph structure.

## Context

Use `~/.agents/skills/thread-map/` as the method reference: normalize first; fixed-schema chapter state (goal, decisions, artifacts, dead ends, open questions) with source pointers; diff consecutive states; treat compaction summaries as claims checked against raw events; anchor artifact claims only in observed transcript evidence. For live updates, the pending batch is provisional, not a completed chapter. Reuse 049's owner-released bootstrap representation; its stable-SHA closure remains open but is no longer a file-ownership blocker. This todo owns `pi-tether/src/mother.ts`, `src/contract.ts`, and a distinct incremental-update test file; avoid `src/index.ts` (051) and bootstrap files (049). Do not stage or commit shared changes; final stable-SHA verification remains open.

## Acceptance criteria

- [ ] The model sees normalized new evidence and the prior map, with a fixed state/delta schema and raw source refs for every changed claim.
- [ ] The update compares against existing map state and compacts duplicates/obsolete detail; it does not create one graph node per message/tool event.
- [ ] Compaction summaries cannot override contradictory raw evidence; cursor/checkpoint only advances with accepted, correctly cited updates.
- [ ] Tests replay a multi-exchange short batch, a compaction-boundary batch, and a contradicted in-transcript summary; verify state diff, source citations, compaction, and cursor behavior.
- [ ] Bootstrap and ordinary updates use compatible state semantics; no second ledger or new automatic retrieval call is introduced.
- [ ] `pi-tether` checks pass at a stable SHA.

## Out of scope

- Wake scheduling (051), cold-catch-up mechanics/measurement (049), pi-intercom/pi-delegate changes, live artifact scanning outside evidence Mom already receives.

## Evidence

- Integrated in the shared working tree: ordinary batches are normalized into a fixed chapter-state schema with citations; a multi-exchange batch remains one provisional chapter/graph node; compaction boundaries group evidence; raw evidence overrides contradictory compaction-summary claims; rejected updates leave the cursor unchanged. Bootstrap and incremental updates share the chapter representation; no second ledger or retrieval call was added.
- `mother.ts` tracks the prior chapter boundary from committed evidence and advances it only after durable accepted coverage, avoiding a full-prefix scan/copy on each update.
- Tests: `cd pi-tether && npx tsx --test test/incremental.test.ts test/bootstrap.test.ts` passed 11/11; full `cd pi-tether && npm run check` passed typecheck and 158/158 tests in the shared working tree. These are working-tree results, not stable-SHA verification; do not mark complete before the closing commit exists.
