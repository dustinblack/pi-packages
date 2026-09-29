# Trajectory acceptance pre-registration (todo 008)

This protocol was committed before validator labels and before any production Mom scoring. The immutable private packet is identified by `manifest.json`; it is evidence, not a committed artifact. No Luna call was made while selecting cases. Selection used only chronological lead `user`/`user_answer` directions and the movement/contract definitions below. Rubric outcomes, stale-transition labels, prior Mom maps/results, and model output were forbidden.

## Blind packet and labels

There are exactly five neutral boundaries per transcript, one each selected to cover pivot, assent, conflict, return, and stale-risk situations. These coverage names select situations; they are not answer labels. Each private case contains the boundary plus the two preceding and two following lead directions when available, exact event numbers/refs, and no assistant/model output. Validators may inspect only that case's supplied raw context and cited original source ranges. They must not inspect the three existing rubrics, stale-transition labels, prior Mom maps/results, another validator's work, or production output.

Each validator chooses exactly one movement:

- **accept** — explicit assent adopts a previously proposed direction without otherwise changing its scope.
- **expand** — add compatible durable scope while preserving the governing purpose and existing scope.
- **contract** — narrow or remove scope, permission, or an alternative while preserving the governing purpose.
- **redirect** — replace or park the current course in favor of materially different work; the original session purpose remains grounded.
- **reorganize** — preserve purpose and scope but change structure, sequencing, focus, or the route/point of return.

Status quo is the default interpretation: preserve all unaffected purpose, scope, obligations, alternatives, and unresolved return points. Validators classify only the delta supported by the supplied evidence; terse assent is interpreted with its preceding supplied direction. They record a short rationale and cited refs, but no confidence-weighted or partial labels.

Two independent validators label all 15 cases in fresh contexts. Their labels are sealed before adjudication. On disagreement, a third independent model receives the same blind case de novo, without identities, prior rationales, vote counts, rubrics, maps, results, or Luna output; a matching pair is final. If all three labels differ, all three re-read only that case and must document a unanimous consensus before any Luna run. No case may be dropped, replaced, relabeled, or redefined after production scoring begins. The finalized label file and its SHA-256 are recorded privately before replay.

## Pre-registered gate

For each case, a scorer assigns one movement to the production graph delta using the same definitions and status-quo rule, without seeing the consensus label. A case scores 1 only for an exact movement match to the finalized consensus label; otherwise it scores 0. No partial credit. Pass requires both:

- at least **12/15 overall**, and
- at least **4/5 in each transcript**.

Irrespective of the numeric score, the run critically fails if comparison with validated case evidence shows any of:

1. an unsupported current purpose;
2. a rejected or superseded alternative revived as current; or
3. an unresolved return point lost.

Two scorers independently inspect critical-fail evidence and cite packet refs. Disagreement is resolved before unblinding the aggregate score by the same third-validator rule above. Runtime/host rejection, missing output, or an unclassifiable delta scores 0; it is not silently treated as status quo.

## Production harness plan (not run in phase 1)

The replay harness will adapt each immutable bundle to the current session-manager/store interfaces and instantiate the production `Mom` from `src/mother.ts` with the exact model `openai-codex/gpt-5.6-luna` at low reasoning. It will call `Mom.open()` and ordinary background `Mom.update()` with no explicit question, preserve chronological cuts, and save the accepted production graph immediately before and after each registered boundary. This exercises the current production `MOM_PROMPT` through `Mom`; it will not import, copy, or invoke `experiments/mom-replay.ts` or the untracked `.mom-contract-replay.mts` prompt/harness.

Each background update has retrieval disabled and is limited by current `Mom` to at most two model calls (initial transaction plus one repair). The adapter will assert `<=2` calls for every update, no fallback model, no future event exposure, no source gaps, atomic checkpoint retention on rejection, and exact case refs. Raw requests, responses, graph deltas, call counts, model identity, and failures remain in a new private output directory. Labels stay sealed until all outputs and movement classifications are hashed. Phase 1 implements and runs none of this scoring plan.
