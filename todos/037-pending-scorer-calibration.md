---
status: pending
issue_id: "037"
tags: [mom, pi-tether, acceptance, research]
dependencies: ["008"]
---

# The blind scorer set and the gold set do not share movement semantics

## Outcome

A follow-up measurement explains why the V2 blind score failed so far below the preregistered gate, and decides which scoring definition the acceptance gate should use: cross-scorer-set calibration, a rubric/exemplar bridge between the two scorer pools, or a stated rescoring protocol — before any further claim about Mom's map quality.

## Context

- Todo 008's V2 run produced `3/15` with zero critical-gate violations and zero unresolved gaps, so the run itself was clean; the disagreement is what failed it.
- The two blind scorers agreed with each other on 12/15 movements but produced a different distribution from the gold set: expand 7 vs 1, accept 2 vs 5, contract 2 vs 4, redirect 4 vs 3, reorganize 0 vs 2.
- V1 was already inconclusive on classifier and temporal-horizon grounds; this is a second independent measurement problem in the same study.
- Evidence: `pi-tether/experiments/trajectory-acceptance/semantic-score.json`, `REPLAY-RUNS.md` (scoring log), and the private sealed scoring artifacts.

## Acceptance criteria

- [ ] The disagreement is localized: which gold labels and which blind cases, and whether it is a movement-semantics difference or a map-lineage artifact
- [ ] A calibration or bridge method is preregistered before any rescoring (no rescoring after seeing results)
- [ ] The acceptance gate definition is stated: which scorer set defines a match, and how much residual disagreement is tolerable
- [ ] The chosen method is run and its result recorded with durable paths, protocol notes, and the effect on 008's verdict
- [ ] If the verdict changes, 008's Evidence records the change; if it does not, the fail stands as final

## Out of scope

- Changing Mom's runtime, prompt, map behavior, or retrieval. This todo changes the measurement, not the product.
