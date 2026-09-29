---
status: complete
issue_id: "004"
tags: [mom, pi-tether, retrieval]
dependencies: ["002"]
---

# Rank the exact match first in Mom's history search

## Outcome

For the known failing query, Mom's history search returns the exact matching record first.

## Context

- Open review P1 (making-mom, 2026-09-29): "the exact Pi retrieval query ranks TS2554 above TS1005".
- Search lives in `LiveFeed.search` in `pi-tether/src/feed.ts`, which scans payloads on demand and ranks by source time.
- Reproduce the problem before changing anything.

## Acceptance criteria

- [x] A test fails first, reproducing the wrong ranking with the exact query
- [x] After the fix, the test passes and the existing search tests still pass
- [x] Ranking stays a literal, recorded-fact ordering, with no keyword heuristics

## Evidence

- Substantive commit `0bb158b59409e1fb8ea7829a3d1715ea02d098e6`; non-fast-forward merge `178e6e8d338ebcae1fd129ed8329a7eac008e959`.
- Historical failure and exact-query baseline: `/private/tmp/todo-004-evidence.md` (SHA-256 `a00a5dc844cc63279afe0973881e63467261927befe4207ec64d73beff5d3f6d`). Preserved payload scan: `/private/tmp/todo-004-scan.out` (SHA-256 `c6e5c44ac0da38d439f43697517a81b5aa34c67f7f64bdc5923ee2b8eff65909`).
- Final exact-query ranking: `/private/tmp/todo-004-actual-literal-ranking-final.json` (SHA-256 `4864f65d203a34a7a9a2ea9be99ab65d90001f49851f59be0d4b66faa40e8a87`): TS1005 records rank above TS2554 without `TS1005`, source IDs, keyword aliases, or diagnostic/syntax intent boosts in the query/ranker.
- `npx tsx --test --test-name-pattern='ephemeral vectorless search ranks literal recorded terms' test/feed.test.ts`: 1/1 passed.
- `cd pi-tether && npm run check`: typecheck and 94/94 tests passed. `git diff --check`: passed.
- An equivalent-original-source answer is intentionally evaluated by todo 013; it is not a todo 004 ranking failure.
