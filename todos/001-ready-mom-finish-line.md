---
status: ready
issue_id: "001"
tags: [mom, pi-tether, hub]
dependencies: []
---

# Mom works live, reliably, and cheaply on real sessions

## Where we are

trunk:    012 — optional Kev screening before Mom wakes
tangents: 015 — ready; 011 and 014 — complete; 016 — pending decision

008 is pending/inconclusive; resume only after the user promotes it once a stable bounded replay path is available.

## Findings

- Design of record: `AwesomeNotes/Coding Agents AI stuff/Mom - complete design map 2026-09-29.md` (every rule with its session line pointer) plus `MOM-HANDOFF.md`. Pointers `[n]` below are raw line indices in `~/.pi/agent/sessions/--Users-ssweens-src-pi-packages--/2026-09-26T23-49-53-444Z_01a0e020-12a4-7474-819f-ad784bb5febd.jsonl`.
- Mom's sidecar-only state, settled-boundary waking, advisor, presentation, and tests landed at `65856a8`. Todo 003's bounded background update and durable gap recovery landed at `17e508b`; todo 004's literal-only history ranking through `178e6e8`; todo 005's raw-segment compaction review and branch-wide repeated-boundary correction through `6872740`, with final reviewer `SHIP` and latest closure `925bd40`; todo 006's real-terminal current-display acceptance and reviewed cached `/mom map` alias through `b976dd4`; todo 007's persisted full-purpose mother root through `a29b32b`; todo 009's enabled-only lead pivot/assent instructions through `45a85e6`; and todo 010's map/notice/usage-only sidecar through `77350ec`. 111 Tether + 38 delegate tests attributable to this hub pass; the full current-main delegate suite reports 40 because it also includes two independently owned standalone tests.
- The map now persists one stable coordinating mother root, and public English `Why` text names an explicit grounded `purposeSource`. Bounded ordered recovery keeps oversized gaps within the one-proposal/one-repair budget. A read-only current-session capture validates the persisted root, grounded purpose, current/parked hierarchy, and immutable frozen prefix; its attempted full 7,336-line replay stopped after 29 batches and 48 calls with evidence remaining. It contains no real alternative edge and is not a full trajectory proof; deterministic fixtures cover alternatives, while todo 008 owns full replay acceptance.
- Todo 008 recovered and hashed all three bundles and finalized 15/15 matching-pair gold labels. V1's 3/15 is inconclusive because temporal-horizon and structural-classifier P1s invalidate acceptance scoring. V2 preregistered aligned semantic scoring, but only 5/15 horizons are reusable; its bounded replay was cancelled for latency/transport before a valid result. The safe harness landed without a production prompt change, and 008 remains pending until the user promotes it after a stable bounded replay path is available.
- PageIndex-style retrieval probes used 3 predeclared questions and 20 calls. Literal search passed 1/3 in 11 calls; map navigation passed 0/3 in 9 calls. Production stayed unchanged; richer labeled handles and original-source selection remain a pending experiment in 016.
- Live terminal acceptance: the original five-turn line was simplified by the backlog owner to 1–2 real turns in the approved file-todo board summary before execution; it was not a quoted user directive. Closure follows that board criterion: two real consecutive settled turns each produced one later Mom update; `/mom map` showed the current accepted map, the widget reported `up to date`, no stale node was marked current, and no permanent update failure appeared → 006 complete.
- Update budget: background updates now use one proposal plus at most one aggregated repair, with `commit_graph` as their only tool. Explicit questions retain five calls, two searches, and two reads. A failed exact range waits for newer settled material or explicit refresh; two deterministic failures create an atomic visible gap so newer evidence proceeds, while provider/source/invalidation/storage failures never skip. `/mom refresh` retries the oldest gap → 003 complete at `17e508b`.
- Every successful compaction receives one bounded Mom review against the actual replaced branch range plus the source-backed map. The remaining review P1 now searches the entire selected branch for the latest prior compaction, so a new boundary before that compaction record still starts capture at the prior `firstKeptEntryId`, never branch root → 005 complete through `6872740`.
- Waking on every event cost 787 calls and $2.02 in one session [6766]. That is fixed in the working tree but not yet measured → 015.
- Dead end: per-message and per-fragment classification. Removed at the user's direction [5315][5325]. Do not reintroduce it.

## Children

- 002 — complete — `65856a8` + closure commit — working tree landed and pushed
- 003 — complete — `17e508b` + closure commit — one-call routine updates, bounded repair, durable visible gap and refresh recovery
- 004 — complete — `0bb158b` + merge `178e6e8` — exact literal ranking restored without keyword heuristics
- 005 — complete — `608e83a` + review fixes `d50ae02`, `6872740` + latest closure `925bd40` — final reviewer `SHIP`; raw compaction review and one deferred corrective advisory
- 006 — complete — `b055b52` + merge `b976dd4` — real-terminal current display accepted; reviewed `/mom map` alias
- 007 — complete — `ec71ff0` + fixes through `4eefa7c` + merge `a29b32b` — stable full-purpose mother root, grounded `purposeSource`, bounded gap recovery
- 008 — pending — labels and aligned scorer preregistration preserved; replay inconclusive/cancelled before a valid result; no production prompt change
- 009 — complete — `be537b4` + merge `45a85e6` — lead receives pivot/assent rules only while Mom is enabled
- 010 — complete — `d4cb4d9` + `d55f39e8` + merge `77350ec` — sidecar pruned to map, notice, and usage
- 011 — complete — `a2211d0` — four sourced process-risk classes, stable deduplication, atomic resolution, and a real Luna advisory capture; combined main passes 128 Tether + 40 delegate tests
- 012 — ready — making-mom, delegates
- 013 — complete — `d6158d1`, `5722cba` + merge `94bb3bb` — search won 1/3 versus map 0/3; no production change
- 014 — complete — `58ac5a0` — Alt+T Mom conversation; actual-terminal switch/answer/return preserves the lead transcript and draft, including the combined 011/widget-fix rerun
- 015 — ready — making-mom, delegates
- 016 — pending — richer labeled map handles and improved original-source selection

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
