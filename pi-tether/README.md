# pi-tether — Mom

Mom keeps track of your goal, what's unfinished, and where to return after a detour. **You lead; agents work. Neither maintains a ledger.**

The map follows what you're building or exploring: **features, theories, postulates, and things you're trying**. Rules, open choices, and observations are attached to that work. They are not separate projects. Exactly one persisted endeavor is the **mother thread**: it carries the source-backed original session purpose and coordinates every current, interrupted, and alternative branch beneath it.

The widget shows the main line and the current branch as a tree, using the same colors and branch marks as pi-omp's todo panel. When transcript coverage is complete, the current location is marked **you are here**. While Mom is busy, blocked, catching up, or has pending coverage, the panel and story reads label the map as a partial last-saved snapshot and suppress current-orientation markers. Each work node shows its state and current progress. Rules, choices and observations are left out of the widget; `alt+t` switches to Mom's dedicated conversation view. Ask there without a slash command, then press Escape or `alt+t` to return to the untouched lead editor and its draft.

Default `mom` reads show a compact story map: the mother thread, current endeavor, live rules, choices waiting on you, recorded outcomes, and handles for folded history. Active purposes and rules show an English `Why` copied as one complete normalized token sequence from evidence, followed by only the explicit `purposeSource` citation that grounds it. Mom does not add separate causal rationale prose. Rules appear as short sentences under their endeavor, not as `governs` arrows or record dumps. Select an endeavor or attached record when you need complete fields and sources. There is no separate graph viewer.

## Run it

```bash
pi -e ./pi-tether/src/index.ts -e ./pi-delegate/src/index.ts
```

After changing an installed extension, use `/reload`. An already-running extension keeps its loaded behavior until reload.

Mom uses **`openai-codex/gpt-5.6-luna`, low reasoning**, through Pi's configured registry and credentials. She does not inherit the lead model or silently choose a fallback.

```bash
pi -e ./pi-tether/src/index.ts --mom-model openai-codex/gpt-5.6-luna --mom-interval-ms 15000
```

Mom batches five completed lead exchanges, or updates when the oldest pending exchange reaches ten minutes—even if it is the only exchange. Automatic updates remain at least 15 seconds apart by default. Delegate settlements can resume a waiting batch but do not count toward the five-exchange threshold. Message completion, individual tool results, delegate start/note events, and idle polling do not wake her. A successful compaction triggers one bounded background review. She never starts routine inference while the lead or a linked delegate is still working. A settled update reads the complete pending user, lead, tool-metadata, and worker slice without blocking the working agent.

### Optional pre-wake Kev/JEV screen

A System One screen can decide cheaply whether a settled batch materially moved the work before Mom’s model wakes:

```bash
pi -e ./pi-tether/src/index.ts \
  --mom-advisor-url http://192.168.1.52:9999/v1/systemone \
  --mom-advisor-model kev-latest \
  --mom-advisor-threshold 0.25 \
  --mom-advisor-timeout-ms 1500
```

The screen receives the saved map, one complete settled evidence batch, one boundary event, pending-coverage state, and currently open process risks. It answers one binary question: whether that batch materially changes purpose, scope, assent, permission, a return point, an outcome, or a consequential process risk. At or above the threshold, Mom’s model wakes and does its full synthesis. Below the threshold, Mom accepts the batch as unchanged current state, advances coverage with one compact cursor record, and makes zero Mom-model calls. The graph, unfinished work, pending notice, and unresolved risks remain unchanged. Routine progress therefore never creates message records or fragments.

This is disabled by default. With no configured screen, ordinary settled updates behave exactly as before. Bootstrap map creation, explicit questions, `/mom refresh`, `/mom correct`, compaction review, and failed or skipped-gap recovery are mandatory bypasses: the screen never suppresses them. An unavailable, malformed, or timed-out screen fails open to Mom’s model and records an unavailable receipt in `/mom detail`; it never pretends to have screened a batch. A failed cursor write retains the unconsumed batch instead of being treated as a classifier failure.

The endpoint guard is unchanged: HTTP only on loopback or private IPv4, path `/v1/systemone`, no redirect, 96 KiB request cap, 16 KiB response cap, and a bounded timeout. Screening receipts ride the accepting map record and remain separate from Mom’s model-usage stream. This is not a semantic safety oracle: a false negative can skip a real change from the saved map, while the original evidence remains readable in session history.

The default threshold is `0.25`, calibrated on the preserved todo-008 evidence: it is the lowest score observed on the preregistered aligned-gold-horizon movement set, so all 15 gold movement windows woke Mom. On the same captured scores it avoided 11 of 30 sampled routine feed wakes; 3 of 24 material preserved-update proposals were skipped, and those are reported as eventual-consistency risk rather than claimed as caught. The previous `0.70` threshold was measured and rejected: it skipped 14 of 15 gold movement windows. Artifacts and the threshold sweep are in `pi-tether/experiments/evidence/todo-012/`.

## Commands

| Command | Action |
|---|---|
| `alt+t` | Switch to Mom's dedicated view. Enter asks from her map; Ctrl+X cancels an answer; Escape or `alt+t` returns to the lead with its draft and context untouched. |
| `/mom` | Open the read-only saved overview. Scroll with arrows or Page Up/Down; Escape closes it. |
| `/mom status` | Show where you are, update status, and usage. |
| `/mom map [id] [depth]` or `/mom graph [id] [depth]` | Show the compact map, or select one record for complete fields and sources. |
| `/mom detail` | Show raw saved data and exact diagnostic errors. |
| `/mom source <id> [offset]` | Read original evidence. Use the bare source ID, without `src:` or brackets. |
| `/mom ask <question>` | Ask Mom to reason about recorded history with bounded source lookup. |
| `/mom correct <text>` | Record your correction without starting a lead turn. |
| `/mom refresh` | Read pending activity, or explicitly retry the oldest skipped evidence gap. No model call when already caught up and no gap exists. |
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

The public map contains one mother-thread root, its child endeavors, and attached annotations. Default output previews two items per group, prioritizing the current, interrupted, and explicitly alternative branches, then shows the remaining count. It shows blocker, alternative, and return links without widening annotation endpoints. It shows at most one quoted hold and provides IDs or checkpoint handles for details. Depth is 0–3; even depth zero explains the main purpose, ancestry, and surrounding work. Earlier views are labeled as history, not restored as current assignments. Original user direction stays accessible separately from Mom's interpretation.

Agents can turn returned data into prose or Mermaid. They do not open threads, report milestones to Mom, or maintain her map.

## How work stays connected

The mother thread is the one root; every other endeavor has an endeavor parent. Its stable ID cannot be replaced by a later side request. Child work can appear during a detour. Related endeavors can merge without flattening their children. When an endeavor finishes, its completed details can fold into its parent's outcome.

Unfinished work and standing rules must survive that fold. Permission to prepare does not grant permission to act. A rule's scope must not silently broaden when work moves. Earlier detail remains available through saved history and source references.

For example, **formatDuration behavior** is the endeavor. **No edits or commits**, **KEEP.txt stays untouched**, **seven assertions passed**, and **wording still undecided** belong under it as rules, observations, and choices—not four peer projects.

## Observation and limits

Mom reads recorded user, lead, and linked worker narrative, plus lightweight tool metadata. Dialog answers from `ask_user` and `gather_input` count as user direction. Original tool arguments and outputs are read only on demand; they are not replayed in every update.

Before Pi compacts context, Mom captures the exact selected-branch entries that Pi is about to replace. After success, one background update compares the provider summary with the current source-backed map and a bounded rendering of that raw segment; active map sources are selected first, so empty and provider-placeholder summaries remain reviewable. If a consequential decision would be lost, Mom can retain one short advisory for the user’s next request. A summary omission alone does not warrant advice.

Mom can also advise when material uncommitted work is piling up with permission to commit, work has consequentially drifted from its goal, or the same fix keeps failing. She must cite current evidence for both the risk and a concrete next step. Counts, elapsed time, unknown verification, and generic good practice are not enough. Mom judges meaning and permission; the host checks source identity, freshness, work ownership, and class prerequisites, not prose semantics.

Advice uses the existing next-request path and never starts a lead turn or an extra Mom pass. Text is brief and contains no internal references. An unresolved risk is identified by its class and stable work ID, not its wording or changing citations. Delivery is reserved in the sidecar before publishing, so a crash may lose advice but cannot duplicate it. Fresh evidence can resolve a risk atomically with its accepted map and evidence position; a later recurrence can then notify once. Branch changes and reloads preserve this suppression.

Worker history must match a delegate invocation on the current parent branch and its owner record. Forked parent history is not treated as new worker work. Missing or changed sources stop the update rather than becoming an empty success.

**Mom cannot edit files, delete files, run project commands, or launch workers.** Advice is not execution permission. User direction remains authoritative.

The model can still misunderstand a rule. Mom therefore keeps source references on material graph records so the original evidence remains inspectable. Every new or updated active, parked, or proposed endeavor or rule must copy its full intent as one contiguous normalized token sequence from one cited event and name that event as `purposeSource`; token boundaries prevent `map work` from matching `Roadmap work`, with no arbitrary minimum length. `purposeSource` must also belong to the node's `sources`. The first mother-thread proposal must use user purpose evidence. Public `Why` lines show the English intent and only that grounding citation; arbitrary `why` or `rationale` fields are rejected. Pre-root nodes inherited through the version-free mother-thread cutover may omit `purposeSource` while unchanged, and display `Why: evidence unavailable`; any later upsert must satisfy the new grounding contract. An existing node cannot silently drop a prior user/user-answer source: it must retain that authority or declare a transaction-local replacement by a later fresh user source kept on the node. This supersession proof is validated and discarded, not persisted as a second ledger. The host validates graph shape, source identity, hierarchy, carry, and fold effects; it cannot prove semantic completeness.

## Saved data and diagnostics

Work kinds are `feature`, `theory`, `postulate`, and `try`; attached records use `rule`, `choice`, and `observation`. Internal record IDs remain addressable so existing carry, scope, and history checks still apply. Public reads group attached records beneath their endeavor.

Mom never writes her state into the session transcript. Map snapshots and patches (including pause/resume, cursors, failures, gaps, and process-risk resolutions), notice delivery reservations, and cumulative usage go to an append-only sidecar beside the session file: `<session>.mom` (deliberately not `.jsonl`, so Pi's session list ignores it). The session transcript is evidence only: embedded Mom state is ignored. A Mom bug or failed write can only affect the sidecar, never the conversation. Map records apply only when their cursor and base map belong to the selected branch, so abandoned branches stay invisible.

The map/notice/usage storage layout remains a clean, incompatible cutover with no migration for older record formats, including the former obligation/trigger notice shape. Before first use of that layout, delete or archive an older `<session>.mom`; the session JSONL remains untouched and continues to supply the conversation evidence. A current-format map created before the explicit `motherThread` pointer receives one narrow, version-free cutover: its existing purpose node becomes the stable root, any peer roots move beneath it without changing sources, and one atomic normalized snapshot prevents repeated conversion.

A material update saves a map snapshot and consumed source positions together. When an accepted update leaves the graph, notice, and unfinished list byte-identical, Mom appends only a small map cursor patch tied to the latest snapshot; cold reload therefore does not replay accepted evidence or duplicate the graph. A cursor patch applies only to its session, base map, and selected branch. When configured, a material map snapshot or cursor patch saves the screen receipt that led to the acceptance. A failed state write leaves the prior durable cursor intact.

A deterministic background rejection receives one repair call. The same range is not retried until a later settled boundary carries newer material, or the user requests `/mom refresh`. Two deterministic acceptance/model-output failures on that exact range create one durable visible gap and advance coverage so newer evidence is not blocked. `/mom detail` reports the failed range, open gaps, and session usage; `/mom refresh` retries the oldest gap alone against the current graph, without mixing later pending evidence, and resolves it after acceptance. Recovery uses the same 24,000-character evidence bound; an oversized legacy gap is retried as deterministic ordered chunks, atomically replacing its open record with the explicit remaining refs until none remain. Provider outages, unreadable/tampered sources, session invalidation, and sidecar write failures never advance or gap evidence.

On startup, reload, or tree navigation, Mom restores and renders saved state without scheduling inference; pending evidence waits for a settled boundary or explicit refresh. Restore checks that the cursor is still on the selected branch and that every saved citation resolves. Worker transcripts are verified byte-for-byte. Parent entries are checked for presence only: Pi legitimately rewrites its in-memory entries, so a re-serialization hash cannot be reproduced. A torn final sidecar line is truncated before the next append; corruption in any complete line remains a loud error.

`change` records before/after counts and created/folded-away record identities with sources. These are recorded facts, not a judgment that Mom interpreted them correctly. `unfinished` records that update's declared carry, move, or resolution—not a second list of current work.

Mom treats recorded conversation as evidence for one synthesized session account. Each fresh model request contains the current graph, a bounded new event slice, and at most one preceding lead context event; it never reconstructs or replays the full user history. She updates the graph only when cumulative evidence materially changes a feature-level purpose, endeavor, durable rule, decision, unresolved choice, tangent, return point, outcome, or completion state. Many messages can support one graph change; an individual message can require none. Sources remain available for audit without becoming a message-coverage ledger.

Folds and merges still require an explicit target update. The reducer adds validated operation sources to that target instead of requiring the model to copy them twice. References from retired work stay in history rather than accumulating on the live target.

The account is limited to 24,000 serialized characters. Each update allows 24,000 characters of new events and 90,000 characters of model context. Background settled-boundary and refresh updates expose only `commit_graph`: one proposal plus at most one repair. Explicit questions retain five total model calls and separate limits of two metadata searches and two original-source reads. Each source read holds at most 4,000 characters; reading either side of a tool call includes its paired record within that limit. Limits stop an update; they do not silently discard remaining work.

Background requests explicitly ask for graph maintenance. Their tool schema has no answer field, and the host rejects unsolicited answers before saving coverage. Saved-map updates retain the opening request's source pointer without repeating its question text; cold starts and explicit questions still receive the text. New requirements and reported outcomes belong on the affected work even when the overall purpose stays the same. These checks separate tasks; they cannot prove that every model interpretation is complete.

Source search accepts only short literal phrases and scans original payloads ephemerally without persisting a second index. It ranks exact phrases and informative query/question-token intersections, deduplicates tool pairs toward the observed result, and returns only references plus safe match metadata—never payload excerpts. A malformed query returns repair feedback without consuming a search. A first zero-result search exposes only one shorter literal retry. A successful question search must be followed by an original-source read.

## Usage and checks

Regression checks cover a single exchange just before and at its ten-minute deadline, the running extension's timer-driven checkpoint, and rejection of a historical-question answer without advancing coverage. Explicit questions retain their answer schema and response path. Run these with `npm run check`.

`/mom status` reports accumulated calls, tokens, nominal cost, and update time. `/mom detail` exposes input, output, cache-read, cache-write, call, elapsed-time, and nominal-cost totals as structured session usage. Subscription cost metadata is not an invoice. **Low overhead and cache causality are not established.** Mom keeps one requested cache key across fresh updates in one branch instance; it still starts each update with a fresh bounded conversation.

A frozen live session-synthesis check passed 3/3 independent siblings. Each first update took one model call; close-out took one or two calls, with repair counts 1, 0, and 1. Acceptance checked the compact active account—not sentence reproduction: it retained user control of the answer, the unanswered negative-zero state, material user provenance, and no obsolete child endeavor. This is one bounded case, not a general semantic-reliability or low-overhead claim. Proof: `/tmp/pi-tether-session-live-proof.json` (prompt `bd97d3f7…`, tools `ca97732a…`, baseline `28310579…`). Paused restart and cached reads make no Mom model calls.

```bash
cd pi-tether && npm run check
npx tsx test/terminal-mom-proof.ts # isolated tmux PTY + local loopback provider
cd ../pi-delegate && npm run check
```

The deterministic suite covers settled-boundary scheduling, unique mother-root hierarchy, multi-chapter cold catch-up, English purpose plus explicit `purposeSource`, current/interrupted branches, alternative links, atomic graph cutover and the first post-cutover no-op, bounded ordered gap recovery, carry, source lookup, sidecar-only state, storage failure, worker history, reload, and quiet advice. The v3 isolated Luna-low artifact at `experiments/evidence/todo-007-real-luna-purpose-map.json` validates bounded real-session synthesis with English `Why`, explicit `purposeSource`, and parked work. An intentional attempt to replay the full frozen 7,336-line snapshot processed 29 batches in 48 model calls, then ended with an open gap and remaining evidence; it exposed the grounded gap-recovery failure that is now fixed. This was not a complete replay. The frozen snapshot was verified as an exact byte prefix because the live source appended during the run; no whole-source unchanged claim is made. The real capture contains no `alternative_to` edge, while deterministic fixtures cover alternatives and bounded gap recovery. Full-trajectory replay belongs to todo 008. Scripted model replies check mechanics, not arbitrary model judgment. See [the experiment record](experiments/README.md) for earlier work.
