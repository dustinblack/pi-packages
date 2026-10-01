---
status: pending
issue_id: "057"
tags: [pi-tether, tests, regression, pi-0.99]
dependencies: []
---

# Pi 0.99 migration broke the tether extension harness: Mom updates never complete

## Outcome

`pi-tether/test/extension.test.ts` runs green again at a stable SHA, so real-SDK-harness tests can observe a Mom update and acceptance work is possible.

## Context

- Symptom: 10 of 12 extension tests fail with ~8 s `until()` timeouts, first message `Timed out waiting for automatic observation through the lead's final message` (`test/fixture.ts:28`). Mom never publishes a checkpoint in the harness. Full suite: 144/145.
- **Not** caused by todo 049 (cold catch-up): reproduced identically at `9d45ac8`, which is the commit *before* 049's implementation and which passed 141/141 earlier on 2026-10-01.
- Suspect window: the Pi 0.99 migration commits that landed on main after `9d45ac8` (for example `15fddb5` `chore(pi-rewind): move to Pi 0.99`, `b19aef4` `chore(pi-footsie): move to Pi 0.99`). Both unrelated packages migrate the same SDK/pi-ai versions pi-tether's harness sits on.
- The related todos filed with `2c985ee` (`055` multi-pass google refresh, `056` plugins staging tests) are different failures; this one is not recorded anywhere yet.

## Reproduction

```bash
cd pi-tether
npx tsx --test test/extension.test.ts     # HEAD: 10/12 fail
git worktree add --detach /tmp/chk 9d45ac8 # same failure, earlier 141/141 green
```

## Acceptance criteria

- [ ] Root cause identified: which 0.99 change stops Mom's update from completing in the harness
- [ ] `cd pi-tether && npm run check` passes 145/145 at the fixing SHA
- [ ] The fix is recorded against the owning migration todo, not worked around inside tether tests

## Out of scope

- Todo 049's bootstrap tests (green at `8e6ed0c`, 4/4) and todo 051/052 cadence work, which this failure does not block at the source level.
