---
status: pending
issue_id: "069"
tags: [mom, pi-tether]
dependencies: ["068"]
---

# Audit's summary-only citation rule may reject honest discrepancy items

## Outcome

Decide the audit's citation rule for items that are themselves claims about the compaction summary — discrepancies and open questions about what the summary reports: either allow summary-only citations in those fields (a discrepancy about a claim can only cite the claim when the raw side is unavailable), or keep the rule absolute and accept that such compactions retire their audit after two attempts (068's cap).

## Context

- `audit.ts` rejects any item whose every source is the compaction summary ("Summary-only claim: …"), uniformly across all chapter-state fields, to stop summary claims from grounding work facts.
- Live evidence (2026-10-01 session `01a0f835`, sidecar usage-error records): three of four failed audit runs were rejected on items that read as honest discrepancy-style records — "The closing record reports npm run check passed …; these are reported outcomes rather than independently reproduced evidence", "… treat these as reported, not independently verified", "Commit/push state … cannot be established from the supplied raw evidence in this section" — the model marked reported-but-unverified outcomes exactly as `THREAD_MAP_PROMPT` asks, but the raw evidence (truncated tool output) exists only inside the compaction summary, so no non-summary citation can exist for those items.
- The rejection rule and the repair instruction ("omit unsupported assertions rather than treating summary claims as facts") conflict for claims-about-claims: omitting a legitimate discrepancy hides it; recording it citing the summary is rejected.
- 068 bounds the damage (two failures retire the audit); this todo decides the semantics.

## Acceptance criteria

- [ ] A recorded design decision: which chapter-state fields may cite the compaction summary alone, and why
- [ ] Tests cover the decided rule (a summary-only discrepancy item is accepted or rejected accordingly)
- [ ] `cd pi-tether && npm run check` passes

## Out of scope

- 068's retry cap and retirement (shipped there).

## Evidence

- Filed from the 2026-10-02 investigation of the 068 live brick; the sidecar usage-error records quote the rejected items in Context.
