---
status: ready
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

- [ ] Record types are reduced (target: map, notice, usage), and any other type kept has a one-line reason
- [ ] Cold reopen restores the identical map (hash test)
- [ ] An unaccepted update never advances the cursor except through the 003 gap rule
- [ ] No migration code for old formats
