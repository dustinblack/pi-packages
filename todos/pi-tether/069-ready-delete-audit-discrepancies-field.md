---
status: ready
issue_id: "069"
tags: [mom, pi-tether]
dependencies: ["068"]
---

# Delete the audit's discrepancies field; the citation rule stays absolute

## Outcome

The compaction audit's chapter schema drops its sixth field (`discrepancies`) and uses the same five-field frame as ordinary updates. The summary-only citation rule is then uniformly correct with no exemption question left: a direction the raw evidence still shows is recorded with its raw source even when the summary dropped it; a summary claim with no raw evidence behind it is not recorded at all.

## Context

- Scott's correction (2026-10-02): "Stop structuring stuff so much. Stick to the cord. Do we really need everything that's in there? Prune back aggressively."
- The field fed nothing downstream: the anchor, widget, window checks, and sidecar never read it; the reconstruction's only consumer is the one comparison prompt (`independentThreadMap`). It duplicated the graph's own vocabulary — a contradiction is settled by the raw-grounded side, and a forgotten direction has a raw source and lands in the five fields.
- The field was the live brick's trap: honest "the summary claims tests passed but the raw output was truncated" items could only cite the summary, so the absolute citation rule rejected them deterministically (2026-10-01 session `01a0f835`, three of four failed audit runs). With the field gone, the model drops ungroundable claims, the audit passes, and the map carries only raw-grounded records.

## Acceptance criteria

- [x] The audit schema, prompt, and rejection loop carry five fields; no `discrepancies` anywhere in source, tests, or docs
- [x] A reply carrying the old sixth key is still rejected by the strict schema and repaired in one round
- [x] `cd pi-tether && npm run check` passes

## Out of scope

- The five-field chapter frame itself (goal/decisions/artifacts/dead ends/open questions) — shared with the ordinary update contract and tested; the next prune candidate if Scott wants the cord barer.
- 068's retry cap (shipped in `f1e2af8`).

## Evidence

- `cd pi-tether && npm run check` passed 2026-10-02 after the deletion: typecheck clean and 210/210 tests, unchanged in count — the deleted field had no downstream assertions. `src/audit.ts` loses the schema key, the rejection-loop entry, and the prompt sentence ("Record contradictions, forgotten directions, and story-versus-artifact discrepancies" becomes the outcome without the field: a direction the raw evidence still shows stays with its raw source; an ungroundable summary claim is not recorded). `test/fixture.ts`, the 068 regression test's audit script, and the README audit paragraph drop the sixth key.
- The strict-schema rejection is unchanged and covered: `test/audit.test.ts` ("failed independent reconstruction preserves graph and coverage and retries the audit") already drives an invalid chapter state through `/Invalid thread-map/`, its one repair round, and the sticky retry; `additionalProperties: false` sends a reply carrying the old sixth key down the same path.
- The live brick's root scenario is gone at the schema level: an honest "the summary claims tests passed but no raw evidence verifies it" item has no field to live in, so the model drops it — the audit passes, and the summary-only citation rule stays absolute with no exemption question left. 069's original question (which fields may cite the summary alone) is resolved by deleting the field rather than exempting it.
