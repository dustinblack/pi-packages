---
status: pending
issue_id: "037"
tags: [mom, pi-tether, acceptance, research]
dependencies: ["008"]
---

# Decide what the map-quality acceptance gate actually measures

## Outcome

The 008 acceptance gate is either repaired to measure the right target or explicitly narrowed with the user's approval. The deliverable is a preregistered protocol whose target is stated, whose rubric is validated on controls, and whose result can be attributed — plus a recorded decision on whether Mom's map quality passed it.

## Context

- Todo 008's V2 run was procedurally clean and recorded **3/15** against a ≥12/15 strict-label gate. Numeric corrections now applied to 008's Evidence: 11/15 first-round scorer agreement with 4 adjudications, reused-v1 snapshots 0/5 vs freshly replayed 3/10, structural-classifier distribution redirect 9 / expand 5 / accept 1, and scorerB's `revived_rejected_alternative` violation on case-013 (final clear from A+C adjudication, not from both scorers agreeing).
- Three judging methods on the same 15 map pairs: gold (defines truth), blind models 3/15, structural rules 3/15. Gold and structural agree with each other on only cases 006 and 008.
- **The decisive misalignment is boundary versus interval.** Gold validators classified the session *at* the registered boundary, on evidence only. The blind scorers classified the map transition *across the whole interval through the aligned horizon*. Case-007 (buzz-assent-01) is the clean case: the gold label excludes the subsequent relay expansion; the scored interval contains it. Consuming the registered horizon correctly does not make these the same target.
- **Gold endorsement does not transfer across tasks.** The validators' 13/15 initial agreement and 15/15 adjudicated pairs establish agreement under their evidence-only task, not correctness for a map-fidelity task.
- Representation ambiguity is real but narrower than "any node addition is expansion": case-004 adds a node whose meaning narrows permissible designs (scorers called it expansion), while case-010 was called `contract` despite adding a node. Node addition does not universally force a label, so the boundary/interval mismatch and rubric ambiguity are separate confounds.
- Open procedural item before any rescore: three adjudications succeeded under the default inference setting, were deleted, and were re-run with reasoning disabled to keep one setting. Audit that replacement against the protocol's matching-pair-is-final rule.

## Decision needed

Choose the acceptance target. Reviewed options:

- **(A) Movement taxonomy, repaired.** Preregister the map-movement semantics (evidence signature *and* map signature per label), score boundary-specific transitions or independently label the whole interval, validate on controls, then re-score. Keep movement labels primary. Correct for a label study, but bakes a Mom design opinion into the gate and does not by itself fix the interval mismatch.
- **(B) Corrupt gates only.** Accept the three critical gates (unsupported current purpose, revived rejected alternative, lost unresolved return) as the gate. Cheap — the data exists — but descriptive: three checked properties are not demonstrated completeness, and substituting a narrower bar for a failed preregistered gate needs explicit user approval.
- **(C) Obligation rubric (recommended by review).** Keep movement labels secondary. Derive, per case, independently grounded obligations from evidence — what must become current, what must narrow, what must remain unresolved, what must stay rejected — and judge whether maps represent those facts without unsupported additions. Controls include faithful alternative encodings, unchanged maps, missing accepted work, unsupported additions, revived rejections, and lost returns. This measures the intended product quality without requiring one graph encoding.

## Acceptance criteria

- [ ] The 15 exposed cases are audited into boundary/interval mismatch, representation ambiguity, possible map defect, or insufficient evidence (priority 002, 004, 007, 013, 015)
- [ ] The adjudication-settings replacement is audited against the matching-pair-is-final rule and recorded
- [ ] The chosen target, rubric, thresholds, and controls are preregistered before any scoring
- [ ] Control sensitivity is demonstrated before held-out evaluation (the exposed 15 are development evidence; a held-out set is needed for confirmation)
- [ ] The result is recorded with the verdict, and 008's Evidence records whether the corrected target passes or fails
- [ ] If the user narrows the objective instead of repairing it, that narrowing is recorded as an explicit user decision, not as a reinterpretation of 008

## Out of scope

- Changing Mom's runtime, prompt, map behavior, retrieval, or sidecar. This todo changes the measurement, not the product. No runtime tuning is needed here.

## Trade-offs recorded

- (A) is sound research but a semantics document alone does not fix the interval mismatch or establish validity.
- (B) is cheap descriptive reporting, not acceptance.
- (C) costs more and changes the acceptance question explicitly, but most directly measures the intended product quality. Its residual risk is that a revised rubric could rationalize a genuine Mom defect — mitigated by control validation and the user-approved narrowing rule.
