# pi-tether — Mom

Mom keeps track of your goal, what's unfinished, and where to return after a detour. **You lead; agents work. Neither maintains a ledger.**

The map follows what you're building or exploring: **features, theories, postulates, and things you're trying**. Rules, open choices, and observations are attached to that work. They are not separate projects.

The widget shows the main line and the current branch as a tree, using the same colors and branch marks as pi-omp's todo panel. When transcript coverage is complete, the current location is marked **you are here**. While Mom is busy, blocked, catching up, or has pending coverage, the panel and story reads label the map as a partial last-saved snapshot and suppress current-orientation markers. Each work node shows its state and current progress. Rules, choices and observations are left out of the widget; `alt+t` opens the full saved view.

Default `mom` reads show a compact story map: the current endeavor, live rules, choices waiting on you, recorded outcomes, and handles for folded history. Rules appear as short sentences under their endeavor, not as `governs` arrows or record dumps. Select an endeavor or attached record when you need complete fields and sources. There is no separate graph viewer.

## Run it

```bash
pi -e ./pi-tether/src/index.ts -e ./pi-delegate/src/index.ts
```

After changing an installed extension, use `/reload`. An already-running extension keeps its loaded behavior until reload.

Mom uses **`openai-codex/gpt-5.6-luna`, low reasoning**, through Pi's configured registry and credentials. She does not inherit the lead model or silently choose a fallback.

```bash
pi -e ./pi-tether/src/index.ts --mom-model openai-codex/gpt-5.6-luna --mom-interval-ms 15000
```

Mom updates after a lead turn settles or a linked delegate settles, with at least 15 seconds between automatic updates by default. Message completion, individual tool results, delegate start/note events, compaction, and idleness do not wake her. She never starts automatic inference while the lead or a linked delegate is still working. A settled update reads the complete pending user, lead, tool-metadata, and worker slice without blocking the working agent.

### Optional session-level Kev/JEV review

A System One advisor can cheaply review Mom's proposed account before it is saved:

```bash
pi -e ./pi-tether/src/index.ts \
  --mom-advisor-url http://192.168.1.52:9999/v1/systemone \
  --mom-advisor-model kev-latest \
  --mom-advisor-threshold 0.70 \
  --mom-advisor-timeout-ms 1500
```

The advisor compares the saved account, Mom's draft, and the complete new evidence batch. It returns probabilities for expansion, contraction, redirection, and reorganization plus one map-action decision. A non-`accept` decision, or any review signal at or above the configured threshold, triggers exactly one deeper Mom reconsideration. Mom remains the final authority and may keep her draft. This advisor is disabled by default. The normal Mom path has a five-call ceiling; explicitly enabling the advisor adds its separate review call outside that ceiling.

This is not message classification. The advisor creates no fragments, intake declarations, graph records, or hard gate. One review covers the proposed session account; an unavailable or malformed response is recorded in `/mom detail` and does not block a valid update. The endpoint is disabled when `--mom-advisor-url` is empty. Configured endpoints must use HTTP on a loopback or private IPv4 address, end in `/v1/systemone`, and may not redirect. Responses are capped at 16 KiB.

Measured on the frozen negative-zero case with `kev-latest`: each review took about 0.5 s and 1.0–1.5k input tokens. Across six reviewed drafts it requested zero reconsiderations, including one draft that lost the “do not answer yet” hold. A separate probe flagged an unchanged draft after an explicit goal change (`redirect`, p=0.51). Draft-versus-evidence comparison is therefore unproven as a safety check; treat the advisor as a cheap path-change signal, not an omission detector.

## Commands

| Command | Action |
|---|---|
| `/mom` or `alt+t` | Open the saved overview. Scroll with arrows or Page Up/Down; Escape closes it. |
| `/mom status` | Show where you are, update status, and usage. |
| `/mom graph [id] [depth]` | Show the compact map, or select one record for complete fields and sources. |
| `/mom detail` | Show raw saved data and exact diagnostic errors. |
| `/mom source <id> [offset]` | Read original evidence. Use the bare source ID, without `src:` or brackets. |
| `/mom ask <question>` | Ask Mom to reason about recorded history with bounded source lookup. |
| `/mom correct <text>` | Record your correction without starting a lead turn. |
| `/mom refresh` | Read pending activity. No model call when already caught up. |
| `/mom pause` | Stop background inference; keep the saved view. |
| `/mom resume` | Resume reading pending activity. |

Status, map, detail, and source reads do not call Mom's model. Errors leave the last saved account intact. The widget explains that an update stopped; `/mom detail` retains the exact reason.

## Agent access

```javascript
mom({}) // Compact saved story map plus status.
mom({ graph: {} }) // Compact current story map.
mom({ graph: { nodes: ["work-id"], depth: 0 } }) // Complete selected records and sources.
mom({ graph: { checkpoint: "saved-view-id", nodes: ["work-id"] } }) // Earlier selected records, read-only.
mom({ source: { ref: "source-id", offset: 0 } }) // Original recorded evidence.
mom({ question: "Why did we change direction?" }) // Explicit reasoning and source lookup.
```

Use IDs returned by Mom, not the example IDs. Choose at most one of `graph`, `source`, or `question`.

The public map contains endeavors with attached annotations. Default output previews two items per group, then shows the remaining count. It shows at most one quoted hold and provides IDs or checkpoint handles for details. Depth is 0–3; even depth zero explains the main purpose, ancestry, and surrounding work. Earlier views are labeled as history, not restored as current assignments. Original user direction stays accessible separately from Mom's interpretation.

Agents can turn returned data into prose or Mermaid. They do not open threads, report milestones to Mom, or maintain her map.

## How work stays connected

Each endeavor has a parent or is a root. Child work can appear during a detour. Related endeavors can merge without flattening their children. When an endeavor finishes, its completed details can fold into its parent's outcome.

Unfinished work and standing rules must survive that fold. Permission to prepare does not grant permission to act. A rule's scope must not silently broaden when work moves. Earlier detail remains available through saved history and source references.

For example, **formatDuration behavior** is the endeavor. **No edits or commits**, **KEEP.txt stays untouched**, **seven assertions passed**, and **wording still undecided** belong under it as rules, observations, and choices—not four peer projects.

## Observation and limits

Mom reads recorded user, lead, and linked worker narrative, plus lightweight tool metadata. Dialog answers from `ask_user` and `gather_input` count as user direction. Original tool arguments and outputs are read only on demand; they are not replayed in every update.

Worker history must match a delegate invocation on the current parent branch and its owner record. Forked parent history is not treated as new worker work. Missing or changed sources stop the update rather than becoming an empty success.

**Mom cannot edit files, delete files, run project commands, or launch workers.** Advice is not execution permission. User direction remains authoritative.

The model can still misunderstand a rule. Mom therefore keeps source references on material graph records so the original evidence remains inspectable. An existing node cannot silently drop a prior user/user-answer source: it must retain that authority or declare a transaction-local replacement by a later fresh user source kept on the node. This supersession proof is validated and discarded, not persisted as a second ledger. The host validates graph shape, source identity, hierarchy, carry, and fold effects; it cannot prove semantic completeness.

## Saved data and diagnostics

Work kinds are `feature`, `theory`, `postulate`, and `try`; attached records use `rule`, `choice`, and `observation`. Internal record IDs remain addressable so existing carry, scope, and history checks still apply. Public reads group attached records beneath their endeavor.

Mom never writes her state into the session transcript. Checkpoints, pause/resume, notice delivery, and usage go to an append-only sidecar beside the session file: `<session>.mom` (deliberately not `.jsonl`, so Pi's session list ignores it). The session transcript is evidence only: embedded Mom checkpoints, controls, attempts, and historical maps are ignored. A Mom bug or failed write can only affect the sidecar, never the conversation. Deleting the sidecar resets Mom's map; the transcript is untouched. Checkpoints apply only when their cursor is on the selected branch, so abandoned branches stay invisible.

A material update saves the account and consumed source positions together. When an accepted update leaves the graph, notice, and unfinished list byte-identical, Mom appends only a small progress cursor tied to the latest checkpoint; cold reload therefore does not replay accepted evidence or duplicate the graph. A progress cursor applies only to its session, checkpoint, and selected branch. When configured, a material checkpoint also saves the session-level advisor decision. A failed state write leaves the prior durable cursor intact and retries the same unconsumed batch.

On startup, reload, or tree navigation, Mom restores and renders saved state without scheduling inference; pending evidence waits for a settled boundary or explicit refresh. Restore checks that the cursor is still on the selected branch and that every saved citation resolves. Worker transcripts are verified byte-for-byte. Parent entries are checked for presence only: Pi legitimately rewrites its in-memory entries, so a re-serialization hash cannot be reproduced. A torn final sidecar line is truncated before the next append; corruption in any complete line remains a loud error.

`change` records before/after counts and created/folded-away record identities with sources. These are recorded facts, not a judgment that Mom interpreted them correctly. `unfinished` records that update's declared carry, move, or resolution—not a second list of current work.

Mom treats recorded conversation as evidence for one synthesized session account. Each fresh model request contains the current graph, a bounded new event slice, and at most one preceding lead context event; it never reconstructs or replays the full user history. She updates the graph only when cumulative evidence materially changes a feature-level purpose, endeavor, durable rule, decision, unresolved choice, tangent, return point, outcome, or completion state. Many messages can support one graph change; an individual message can require none. Sources remain available for audit without becoming a message-coverage ledger.

Folds and merges still require an explicit target update. The reducer adds validated operation sources to that target instead of requiring the model to copy them twice. References from retired work stay in history rather than accumulating on the live target.

The account is limited to 24,000 serialized characters. Each update allows 24,000 characters of new events, 90,000 characters of model context, and five total model calls across edits, repairs, searches, and reads. Transaction rejections may use any remaining call; feedback reports the actual calls left. Retrieval has separate limits of two metadata searches and two original-source reads. Each source read holds at most 4,000 characters; reading either side of a tool call includes its paired record within that limit. Limits stop an update; they do not silently discard remaining work.

Source search accepts only short literal phrases and scans original payloads ephemerally without persisting a second index. It ranks exact phrases and informative query/question-token intersections, deduplicates tool pairs toward the observed result, and returns only references plus safe match metadata—never payload excerpts. A malformed query returns repair feedback without consuming a search. A first zero-result search exposes only one shorter literal retry. A successful question search must be followed by an original-source read.

## Usage and checks

`/mom status` reports accumulated calls, tokens, nominal cost, and update time. Subscription cost metadata is not an invoice. **Low overhead and cache causality are not established.** Mom keeps one requested cache key across fresh updates in one branch instance; it still starts each update with a fresh bounded conversation.

A frozen live session-synthesis check passed 3/3 independent siblings. Each first update took one model call; close-out took one or two calls, with repair counts 1, 0, and 1. Acceptance checked the compact active account—not sentence reproduction: it retained user control of the answer, the unanswered negative-zero state, material user provenance, and no obsolete child endeavor. This is one bounded case, not a general semantic-reliability or low-overhead claim. Proof: `/tmp/pi-tether-session-live-proof.json` (prompt `bd97d3f7…`, tools `ca97732a…`, baseline `28310579…`). Paused restart and cached reads make no Mom model calls.

```bash
cd pi-tether && npm run check
cd ../pi-delegate && npm run check
```

The suite covers settled-boundary scheduling, hierarchy, carry, source lookup, sidecar-only state, storage failure, worker history, reload, and quiet advice. Scripted model replies check mechanics, not arbitrary model judgment. See [the experiment record](experiments/README.md) for earlier work.
