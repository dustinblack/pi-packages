---
status: ready
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

- [ ] A test fails first, reproducing the wrong ranking with the exact query
- [ ] After the fix, the test passes and the existing search tests still pass
- [ ] Ranking stays a literal, recorded-fact ordering, with no keyword heuristics
