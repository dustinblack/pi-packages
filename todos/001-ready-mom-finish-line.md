---
status: ready
issue_id: "001"
tags: [mom, pi-tether, hub]
dependencies: []
---

# Mom works live, reliably, and cheaply on real sessions

## Where we are

trunk:    002 — land the uncommitted working tree
tangents: none open

## Findings

- Design of record: `AwesomeNotes/Coding Agents AI stuff/Mom - complete design map 2026-09-29.md` (every rule with its session line pointer) plus `MOM-HANDOFF.md`. Pointers `[n]` below are raw line indices in `~/.pi/agent/sessions/--Users-ssweens-src-pi-packages--/2026-09-26T23-49-53-444Z_01a0e020-12a4-7474-819f-ad784bb5febd.jsonl`.
- Last commit `b5a3195`. The working tree has 26 tracked changes and 8 untracked files (sidecar-only state, waking at settled boundaries, advisor, presentation). 90 Tether + 38 delegate tests pass (making-mom, 2026-09-29).
- Live: the `mom` tool and widget show "could not update this account; last saved view only", with stale nodes marked current.
- Update budget: up to 5 serial full-context calls per update, with no round reserved for any purpose. A failed update keeps its cursor, so the same growing batch is retried at every wake → 003.
- Compaction does not wake Mom, and the option-B note is not implemented. This conflicts with the user's direction [5753][5840] → 005.
- Waking on every event cost 787 calls and $2.02 in one session [6766]. That is fixed in the working tree but not yet measured → 015.
- Dead end: per-message and per-fragment classification. Removed at the user's direction [5315][5325]. Do not reintroduce it.

## Children

- 002 — ready — making-mom (01a0e020), delegates
- 003 — ready — making-mom, delegates
- 004 — ready — making-mom, delegates
- 005 — ready — making-mom, delegates
- 006 — ready — making-mom, delegates
- 007 — ready — making-mom, delegates
- 008 — ready — making-mom, delegates
- 009 — ready — making-mom, delegates
- 010 — ready — making-mom, delegates
- 011 — ready — making-mom, delegates
- 012 — ready — making-mom, delegates
- 013 — ready — making-mom, delegates
- 014 — ready — making-mom, delegates
- 015 — ready — making-mom, delegates

## Outcome

Mom runs in the user's own terminal on real sessions. She keeps the goal, what's unfinished, and the way back after a detour. She updates at the moments that matter and never floods, stays below the lead's model usage, and all of it is committed on main.

## Context

Standing user rules that apply to every child:
- The session JSONL is the history and read-only evidence. Mom's state lives only in her sidecar [6133][6526][6876].
- No versions and no back-compat; we are iterating [6141][6545].
- Nodes are chunks of work: features, hypotheses, tangents. A discovery fills a node; it is not a new node [6063][6089].
- Status quo is the default answer [5811]. The map may be eventually consistent [5895].
- Mom must not double model usage or slow the work [847].
- Kev/Jev is optional and never required [5103].
- Use pi-delegate for worker models, not OpenRouter; Span-1 is the only exception [6077][6082].
- Orchestrate through delegates [6912][6914]. Prune and reuse what exists [6127][6139].

## Acceptance criteria

- [ ] Todos 002–015 are complete, each with a closing commit on main
- [ ] 008 (replay acceptance) and 015 (cost) pass as stated
- [ ] MOM-HANDOFF.md and the design map reflect the final state

## Out of scope

- The Span-1 teacher/student experiment, the todo-projection idea, and cross-session memory. None of these has an approved gate; file them as pending todos if the user asks.
