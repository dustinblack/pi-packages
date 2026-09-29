# Mom implementation handoff

Mom keeps track of the goal, what is unfinished, and where to return after a detour. The lead and delegates do not maintain a ledger for her.

## Current design

- **The map is current state. The session transcript is history.** Mom synthesizes one compact work map; she does not create one record per message or maintain a second conversation history.
- **Session JSONL is read-only evidence.** Mom never writes state there and never restores embedded Mom checkpoints, controls, attempts, or historical maps from it.
- **`<session>.mom` is the only state store.** Its append-only record types are map, notice, and usage. Map records contain accepted snapshots, compact progress cursors, pause/resume state, deterministic retry failures, and visible gaps. A material checkpoint commits the map and consumed transcript/worker cursors together; a graph-identical acceptance advances only a cursor tied to that checkpoint and selected branch.
- **Fresh model calls use page plus slice.** Each request contains the current graph, the bounded new event slice, and at most one preceding lead context event. It does not reconstruct or resend all earlier user turns. Older detail is available through bounded search and source inspection.
- **Automatic inference runs only at settled boundaries.** A settled lead turn or settled delegate run wakes Mom. A successful compaction adds exactly one bounded review boundary. Startup, reload, tree navigation, message completion, tool results, delegate start/note events, and idleness do not. Automatic inference never starts while the lead is working, and a running delegate is not exposed as a partial run.
- **Explicit operations remain available.** `/mom correct`, `/mom refresh`, `/mom resume`, and explicit Mom questions can request work directly. Failed updates retain their unconsumed evidence because only accepted checkpoints advance the durable cursor.

## Map behavior

- Work is one source-backed tree. The persisted `motherThread` pointer identifies the stable coordinating root endeavor and `purpose` points to the same node. Every other feature, theory, postulate, or try belongs beneath it; rules, choices, and observations attach to an endeavor.
- The mother root carries an identifying phrase from cited user purpose evidence. Compact reads derive `Why` only from source handles and distinguish current, interrupted, blocker, return, and alternative paths.
- User pivots silently park interrupted work. Explicit assent is recorded with its scope and remains governing until later clear direction supersedes it.
- Completion and folding must preserve active or parked descendants through explicit carried, reparented, or resolved dispositions.
- Material claims remain source-backed. Tool arguments and outputs are inspected only on demand and are not replayed in routine updates.
- The widget and read-only `mom` tool are derived from the last accepted sidecar checkpoint. If an update fails, they show the last accepted map and expose the exact error through `/mom detail`.

## Current implementation work

The current change makes the coordinating mother thread a first-class persisted root, rejects unrooted/root-replacement proposals, preserves root/hash/cursor through cold reopen, and renders source-only `Why` plus exact blocker/alternative/return links. A current-format pre-root graph receives one deterministic atomic normalization; older sidecar record layouts remain unsupported. Background updates retain the settled one-proposal/one-repair ceiling. Explicit history questions retain five total calls and separate two-search/two-read limits. Optional Kev/JEV review remains present but disabled by default; explicitly enabling it adds its separate review call outside those ceilings.

Mechanical coverage includes:

- no automatic Mom request during a lead tool stream;
- no automatic Mom request while a delegate is running, including across reload;
- one post-settlement request containing the complete user, lead, tool-metadata, and delegate batch;
- first accepted update from an empty sidecar publishes a usable checkpoint;
- no Mom state custom entries in the session transcript;
- branch-safe sidecar restore, failure retry, source lookup, hierarchy, carry, and display behavior.

Scripted tests establish runtime mechanics, not general semantic reliability. The isolated Luna-low capture at `pi-tether/experiments/evidence/todo-007-real-luna-purpose-map.json` did produce one mother root with the original Tether→Mom purpose, current acceptance work, a parked replay branch, a PageIndex alternative, a cold-reload blocker, and reopenable sources. It needed the allowed second call to repair an invalid purpose pointer. This one synthetic source-labeled case is evidence for the contract path, not a reliability claim.

## Verification and next step

Run:

```bash
cd pi-tether && npm run check
cd ../pi-delegate && npx tsx --test test/tether-feed.test.ts
```

Then run the production prompt against the three preserved transcripts and inspect pivots, assent, later conflicts, stale work, root-purpose retention, and retrieval. Do not seed a result from old session-embedded Mom state, alter the user's real session or sidecar, or claim semantic reliability from scripted replies.
