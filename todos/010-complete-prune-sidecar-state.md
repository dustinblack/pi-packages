---
status: complete
issue_id: "010"
tags: [mom, pi-tether, prune]
dependencies: ["003"]
---

# Mom's sidecar holds only her map, her notices, and her usage

## Outcome

Mom's sidecar holds only what she needs: her map with its consumed cursor, the notices she has delivered, and her usage.

## Context

- "We don't need goddamn checkpoints. The history is the history. Mom has her map." [6133]
- "Prune back" [6127]. No back-compat [6545].
- The current `<session>.mom` record types are `checkpoint`, `progress`, `control`, `notice` and `attempt` (`pi-tether/src/sidecar.ts`).

## Acceptance criteria

- [x] Record types are reduced (target: map, notice, usage), and any other type kept has a one-line reason
- [x] Cold reopen restores the identical map (hash test)
- [x] An unaccepted update never advances the cursor except through the 003 gap rule
- [x] No migration code for old formats

## Evidence

- Substantive commits `d4cb4d98d8a47430d36f6194307229b153e352f4` and `d55f39e8bb7944d8b97a4ca97e88a01fc6bd0e5e`; non-fast-forward merge `77350ec7d577ed3bd2119db0925dd282f703285b`.
- Durable record types are exactly `map`, `notice`, and `usage`. Pause/resume `control` is translated into a map patch and is not a fourth persisted family.
- Reviewer-approved branch checks passed with 98 Tether + 38 delegate tests. Integrated main checks passed with typecheck and 99/99 Tether tests plus typecheck and 38/38 delegate tests (the additional Tether test is todo 009's merged standing-instruction test).
- Focused sidecar checks: map/notice/usage persistence and old-shape rejection 2/2 passed. Old formats are rejected, never migrated.
- Cold restore check `fresh Mom contexts checkpoint automatically observed narrative and recover without replay calls`: 1/1 passed and asserts identical graph+cursor SHA-256.
- Branch-gap checks: sibling branch cursors cannot clear the selected branch's retry failure or skipped gap; 2/2 passed. Storage-failure and 003 gap tests keep unaccepted cursors stationary except for the explicit durable gap rule.
- `pi-tether/README.md` requires users to archive or delete an existing `<session>.mom` before this incompatible cutover; the session JSONL remains untouched. Verification used temporary fixtures and did not read, modify, archive, or delete any real sidecar.
- `git diff --check`: passed.
