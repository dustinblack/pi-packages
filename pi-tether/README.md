# pi-tether — Mom

Mom keeps track of your goal, what's unfinished, and where to return after a detour. **You lead; agents work. Neither maintains a ledger.**

The map follows what you're building or exploring: **features, theories, postulates, and things you're trying**. Rules, open choices, and observations are attached to that work. They are not separate projects.

The widget shows the main line and the current branch as a tree, using the same colors and branch marks as pi-omp's todo panel. The current location is marked **you are here**. Finished work, waiting work, and attached rules remain distinguishable. `alt+t` opens the full saved view.

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

Recorded activity schedules background updates, with 15 seconds between updates by default. Idle time alone does not call a model. Background updates do not block the working agent.

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
mom({ graph: { checkpoint: "old-text-view-id" } }) // Complete historical v1 text, which has no node IDs.
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

The model can still misunderstand a rule. One live run kept a separate “do not answer yet” hold through folding, restart, and source reads. A later passing cost run also retained the exact hold, but three sibling clean-prefix trials missed that semantic requirement; two also ended with fold or source errors. The host verifies declared quotes, sources, states, and governing links. It cannot prove that the model declared every constraint. General semantic reliability is not established.

## Saved data and diagnostics

Current accounts use `pi-tether.mom.v4`. Work kinds are `feature`, `theory`, `postulate`, and `try`; attached records use `rule`, `choice`, and `observation`. Internal record IDs remain addressable so existing carry, scope, and history checks still apply. Public reads group attached records beneath their endeavor.

Older v3 thread records convert without inference or replaying consumed activity. IDs, hierarchy, source references, and history remain intact. Earlier v1 snapshots and v2 flat maps stay readable; their interpretation must not resurrect folded-away work as a new assignment.

Each accepted update saves the account and consumed source positions together. A failed update leaves the prior saved state intact. If Pi changes its in-memory session but fails to save it, Mom blocks further writes on that branch. Resolve the storage error, then reopen the session from disk.

`change` records before/after counts and created/folded-away record identities with sources. These are recorded facts, not a judgment that Mom interpreted them correctly. `unfinished` records that update's declared carry, move, or resolution—not a second list of current work.

New user direction is separated into authorized work and continuing rules within the same model call. Its exact text appears once in the model input; the event timeline retains the source reference without repeating the text. Rule quotations must match the source exactly and be attached to an active rule record. Each rule's scope is written once, in its `intent`. Intake checks run before graph edits so unrelated edit errors do not hide invalid rule bindings. If several new directions explicitly bind the same existing active governing rule, the host appends every validated quote and source without requiring duplicate node copies. Explicit invalid replacements still fail. The host checks references and record effects, not whether the model recognized every rule or interpreted it correctly.

Folds and merges still require an explicit target update. The reducer adds validated operation sources to that target instead of requiring the model to copy them twice. References from retired work stay in history rather than accumulating on the live target.

The account is limited to 24,000 serialized characters. Each update allows 24,000 characters of new events, 90,000 characters of model context, four model calls, and two evidence/search pages. Each evidence page holds at most 4,000 characters. Reading either side of a tool call includes its paired record within that limit. Limits stop an update; they do not silently discard the remaining work.

Source search reads original payloads on demand and returns references, not payload copies. A successful question search must be followed by an original-source read when lookup budget remains.

## Usage and checks

`/mom status` reports accumulated calls, tokens, nominal cost, and update time. Subscription cost metadata is not an invoice. **Low overhead and cache causality are not established.** Mom keeps one requested cache key across fresh updates in one branch instance; it still starts each update with a fresh bounded conversation.

On one passing clean-prefix case, Mom made two calls for one accepted update: 8,000 uncached input tokens, 4,736 cached input tokens, 1,719 output tokens, and $0.00375752 nominal cost. The input cache-hit share was 37.19%. One invalid rule binding required the second call. Compared with the earlier five-call debugging run, total nominal cost fell 65.97%; cost per accepted update fell 31.94%. The runs batched activity differently, and three sibling trials failed semantic acceptance, so these numbers are a measured case—not a steady-state or reliability claim. Paused restart and cached reads made no Mom model calls. See [the handoff](../MOM-HANDOFF.md) for the traces and caveats.

```bash
cd pi-tether && npm run check
cd ../pi-delegate && npm run check
```

The suite covers hierarchy, carry, source lookup, migration, storage failure, worker history, reload, and quiet advice. Scripted model replies check mechanics, not arbitrary model judgment. See [the experiment record](experiments/README.md) for earlier work.
