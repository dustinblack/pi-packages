---
status: complete
issue_id: "013"
tags: [mom, pi-tether, retrieval, research]
dependencies: ["004"]
---

# Measure whether map-guided navigation answers history questions better than literal search

## Outcome

Evidence showing whether map-guided navigation, PageIndex-style, answers history questions better than literal search.

## Context

- PageIndex: https://pageindex.ai/blog/pageindex-intro [6522].
- This is making-mom's open item: bounded map navigation plus original-source reads, run on the preserved transcripts.

## Acceptance criteria

- [x] A question set whose answers come from the transcripts
- [x] Map navigation compared with the current search on accuracy and call count
- [x] Results reported with paths
- [x] Production code changes only if navigation wins, and then only as a new follow-up todo

## Evidence

- Substantive commits: `d6158d164e158f2086933aa1893e788f917f89b8` and `5722cba7bef810018b3e5cc975d4864ed44cb873`; non-fast-forward merge: `94bb3bb66708999ebb6cc2c27f3bbf7a657241a7`.
- Durable protocol, question contract, harness, results, and report: `pi-tether/experiments/pageindex-questions.json`, `pi-tether/experiments/pageindex-compare.ts`, `pi-tether/experiments/pageindex-results.json`, and `pi-tether/experiments/pageindex-report.md`.
- Durable captured audit evidence: `pi-tether/experiments/evidence/pageindex-20260929/`; checksum/size manifest: `pi-tether/experiments/pageindex-artifacts.json`.
- Independent validator: `cd pi-tether && ./node_modules/.bin/tsx experiments/pageindex-validate.ts` — passed with 3 questions, 6 results, 75 artifacts, and 20 calls total. Search passed 1/3 in 11 calls; map navigation passed 0/3 in 9 calls.
- Standalone strict experiment typecheck passed for `pageindex-compare.ts`, `pageindex-protocol.ts`, and `pageindex-validate.ts` using the command recorded in the report.
- Diff check from pre-merge `925bd40f9741f544f40bed9aa0f46bf03f82ab38` through the merge found no changes under production `pi-tether/src`, `pi-tether/test`, `pi-delegate/src`, or `pi-delegate/test`.
- The map condition carried 887/903 SSMP events and exposed unlabeled source handles. Search won on accuracy, so the production-change gate stayed closed.
- Fresh reviewer verdict after audit-preservation fixes: `SHIP`.
