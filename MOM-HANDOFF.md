# Mom implementation handoff

Mom keeps track of the goal, what is unfinished, and where to return after a detour. The lead and delegates do not maintain a ledger for her.

## Current design

- **The map is current state. The session transcript is history.** Mom synthesizes one compact work map; she does not create one record per message or maintain a second conversation history.
- **Session JSONL is read-only evidence.** Mom never writes state there and never restores embedded Mom checkpoints, controls, attempts, or historical maps from it.
- **`<session>.mom` is the only state store.** It contains accepted checkpoints, compact progress cursors, pause/resume state, notice-delivery keys, and usage/attempt records. A material checkpoint commits the map and consumed transcript/worker cursors together; a graph-identical acceptance advances only a cursor tied to that checkpoint and selected branch.
- **Fresh model calls use page plus slice.** Each request contains the current graph, the bounded new event slice, and at most one preceding lead context event. It does not reconstruct or resend all earlier user turns. Older detail is available through bounded search and source inspection.
- **Automatic inference runs only at settled boundaries.** A settled lead turn or settled delegate run wakes Mom. Startup, reload, tree navigation, message completion, tool results, delegate start/note events, compaction, and idleness do not. Automatic inference never starts while the lead is working, and a running delegate is not exposed as a partial run.
- **Explicit operations remain available.** `/mom correct`, `/mom refresh`, `/mom resume`, and explicit Mom questions can request work directly. Failed updates retain their unconsumed evidence because only accepted checkpoints advance the durable cursor.

## Map behavior

- Work is hierarchical. Features, theories, postulates, and things being tried are endeavors; rules, choices, and observations attach to an endeavor.
- User pivots silently park interrupted work. Explicit assent is recorded with its scope and remains governing until later clear direction supersedes it.
- Completion and folding must preserve active or parked descendants through explicit carried, reparented, or resolved dispositions.
- Material claims remain source-backed. Tool arguments and outputs are inspected only on demand and are not replayed in routine updates.
- The widget and read-only `mom` tool are derived from the last accepted sidecar checkpoint. If an update fails, they show the last accepted map and expose the exact error through `/mom detail`.

## Current implementation work

The in-progress change removes the rejected per-message trigger and full `userHistory` payload, makes sidecar state exclusive, and defers parent updates while a linked delegate is running so one post-settlement batch contains the complete lead and worker activity. Transaction validation now reports independent source, authority, contraction, and unfinished-disposition defects together so one repair can address a whole batch. History questions use an ephemeral vectorless scan over original sources, return only safe match metadata, and retain separate two-search/two-read limits. Optional Kev/JEV review remains present but disabled by default; explicitly enabling it adds its separate review call outside Mom's normal five-call ceiling.

Mechanical coverage includes:

- no automatic Mom request during a lead tool stream;
- no automatic Mom request while a delegate is running, including across reload;
- one post-settlement request containing the complete user, lead, tool-metadata, and delegate batch;
- first accepted update from an empty sidecar publishes a usable checkpoint;
- no Mom state custom entries in the session transcript;
- branch-safe sidecar restore, failure retry, source lookup, hierarchy, carry, and display behavior.

The scripted tests establish runtime mechanics only. Real-model map quality still requires the preserved transcript replay. Earlier replay attempts exposed sequential authority/fold errors and weak source selection; the current validators aggregate those defects and retrieval now ranks original evidence without persisting or exposing payload text. No new real-model success claim has been made yet.

## Verification and next step

Run:

```bash
cd pi-tether && npm run check
cd ../pi-delegate && npx tsx --test test/tether-feed.test.ts
```

Then run the production prompt against the three preserved transcripts and inspect pivots, assent, later conflicts, stale work, and retrieval. Do not seed a result from old session-embedded Mom state, alter the user's real session or sidecar, or claim semantic reliability from scripted replies.
