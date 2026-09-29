---
status: pending
issue_id: "016"
tags: [mom, pi-tether, retrieval, research]
dependencies: ["013"]
---

# Improve buried-history recall before adopting map-guided retrieval

## Outcome

A broader controlled experiment determines whether richer labeled map handles and better original-source selection can improve recall for facts buried in transcript tool evidence.

## Context

- Todo 013's three-question comparison favored current literal search on accuracy: search passed 1/3 while map navigation passed 0/3.
- Search used 11 model calls; map navigation used 9, but carrying the graph made the map condition more expensive despite two fewer calls.
- The SSMP map covered 887 of 903 events. Its source arrays were unlabeled handles, and the expected source was present in the observed event prefix but absent from graph source handles.
- The small question set is not a reliability estimate. The next experiment must broaden the hidden questions and grading rather than tuning only to the three known probes.

## Decision needed

Decide whether map-guided retrieval merits a production follow-up only after measuring richer structural labels and improved selection of inspected original sources against a broader, predeclared hidden question set.

## Acceptance criteria

- [ ] Predeclare a broader hidden question set across multiple preserved sessions, with expected original sources and source-aware grading before model calls
- [ ] Compare the current literal search baseline against map navigation with richer labeled source handles under explicit, comparable call and source-read budgets
- [ ] Measure whether improved original-source selection raises answer accuracy, not only whether answer text looks correct
- [ ] Report accuracy, call count, token/cost usage, map event/handle coverage, and failure categories with durable audit paths
- [ ] Record a production adoption decision in a future ready todo only if the experiment justifies it

## Guardrail

This pending todo authorizes research artifacts only. Do not change production retrieval, map, sidecar, prompt, or runtime behavior until a separately approved future ready todo names the implementation and acceptance gate.
