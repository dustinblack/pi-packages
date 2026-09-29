---
status: complete
issue_id: "007"
tags: [mom, pi-tether, map]
dependencies: ["003"]
---

# The map covers the session's full purpose and shows the mother thread as a node

## Outcome

The map for this project goes back to the session's original purpose, and shows the coordinating mother thread as one of its nodes.

## Context

- "the current mom showing for this project needs to be focused on pi-tether/mom and clearly isn't going back far enough to know the full context and purpose of this session" [6972].
- "it needs to show that it has a coordinating mother thread as one of its nodes" [6981].
- Each call carries only the current graph plus a new slice, so catching up from cold needs several bounded updates.
- Prior art: the `thread-map` skill at `~/.agents/skills/thread-map/SKILL.md` segments a session at its compaction boundaries. Its design reference is `/Users/ssweens/src/playbook/skills/thread-map/README.md`.

## Acceptance criteria

- [x] On a read-only copy of the making-mom session, the map root states the original purpose (Tether → Mom) and the top-level endeavors across its chapters
- [x] The mother thread appears as a node
- [x] Catch-up stays within the 003 budget per update (multiple updates allowed)
- [x] A test covers cold catch-up

## Evidence

- Substantive implementation: `ec71ff0d80c83999c8e3bf2eba6b0e7c51dd3b3b`.
- Review and grounding fixes: `dce6ff1b1880f4a52425cf8465b9989b80543147`, `cb34bc8dd7e8317e4c8394fc111330838ec7923d`, and `4eefa7cd41d1f85f74dfba39407487e5f65c9e77`.
- Capture evidence: `2c1799ccd782c20cdda7c6f46ac3d15fc41e11c2`; evidence-alignment docs: `381eb67422f9b78bdcb94911e69f7ebf02d44161`; non-fast-forward merge: `a29b32b81bfdd960f63f5b05e2d4e68d9b525389`.
- Durable capture and validator: `pi-tether/experiments/evidence/todo-007-real-luna-purpose-map.json` and `pi-tether/experiments/validate-todo-007-capture.ts`. The bounded read-only current-session capture validates a persisted mother root, source-grounded English `Why` with explicit `purposeSource`, current and parked hierarchy, cold-reopen graph identity, and frozen-prefix immutability. It does not contain a real `alternative_to` edge.
- Deterministic fixtures validate active, interrupted, and alternative hierarchy, stable cold catch-up, and the one-proposal/one-repair background ceiling. Scripted replies establish mechanics, not general semantic reliability.
- An attempted full replay of the frozen 7,336-line current-session snapshot was intentionally stopped after 29 batches and 48 calls with evidence remaining. It exposed grounding and oversized gap-refresh defects, now fixed by `4eefa7c`; it was not a complete current-session replay. Full trajectory replay belongs to todo 008.
- Capture validator passed read-only with: `{"valid":true,"status":"blocked","snapshotLines":7336,"finalRef":"01a0e020-12a4-7474-819f-ad784bb5febd:94296916","batches":29,"calls":48,"cursor":"43284208","remainingEvidence":true,"graphSha256":"c6037e7ec11a15358fed9b580c0759e1bb1715d5e42b1cf55f0efbfa9e83cf70"}`. Here `blocked` and `remainingEvidence:true` honestly describe the intentionally incomplete full replay; the bounded acceptance capture and deterministic regressions are the todo 007 evidence.
- `cd pi-tether && npm run check` — typecheck passed; 111 tests passed, 0 failed.
- `cd pi-delegate && npm run check` — typecheck passed; 39 tests passed, 0 failed. The prior 38-test baseline became 39 because independent preserved todo-017 commit `0efe7f8` added its wait/intercom regression; todo 007 did not edit that work.
- `git diff --check` passed. No `node_modules` path or symlink was added or changed, and the todo-017 files were unchanged by the merge.
- Fresh reviewer verdict: `SHIP`.
