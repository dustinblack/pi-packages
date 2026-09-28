# Mom slim-feed experiment

This directory preserves the offline experiments that preceded the automatic Mom runtime. Statements below about unchanged Tether behavior or future integration describe those historical runs, not the current extension. See [the live runtime](../README.md) for current behavior. Feed extraction makes no model calls. The opt-in replay calls a model with read-only evidence access and writes experiment artifacts, not project changes. Neither requires new reporting by the lead or workers.

## Feed contract

Keep all original user and assistant text, including worker commentary, without truncation. Add tool names, call/result associations, recorded error flags, timestamps, and source references. Keep extension messages separate from user instructions. Mark attachments as not interpreted.

User answers to `ask_user` and `gather_input` are **user direction**, not tool output. The feed includes the question and option titles the user saw on the tool call, plus the answer as a `user_answer` event. It omits the model-written dialog context. Before this change, six decisions in the pi-packages session were invisible to Mom, including “Separate mother” and “In-process feed.”

Do not routinely include other tool arguments/results, reasoning blocks, system prompts, custom extension state, or compaction summaries. Exclude Tether's own state messages to avoid feeding Mom's map back as independent evidence. Delegate completion receipts carry recorded status; the worker's original report appears once through its own transcript.

The experiment follows pi-delegate's parent-owned run pointers, including workers in other worktrees. It uses immutable `forkedMessages` to skip inherited context, not `startIdx`, which changes when a worker resumes. Run records supply identity and linkage only: their eventual output/status never leaks into an earlier replay checkpoint. Older subagent systems are not covered.

A `returned` tool record means `isError:false`, not that tests passed or work was verified. Missing details require source lookup, not inference. Facts present only in unexamined tool output can be missed.

## Run

From `pi-tether/`:

```sh
./node_modules/.bin/tsx experiments/slim-replay.ts measure /absolute/session.jsonl
./node_modules/.bin/tsx experiments/slim-replay.ts export /absolute/session.jsonl /tmp/new-private-bundle --until 2026-09-27T04:15:00Z
./node_modules/.bin/tsx experiments/slim-replay.ts lookup /tmp/new-private-bundle s0:ENTRY_ID 0 4000
```

The export directory must not exist. It contains:

- `feed.txt`: compact text for a model, preserving the narrative verbatim.
- `feed.jsonl`: the same events with structured metadata.
- `sources.json`: source byte ranges and SHA-256 hashes, plus stream identities. No copy of raw tool output.
- `metrics.json`: counts, byte sizes, approximate tokens, recorded actor usage, and extraction time.

Bundles are private local files (directory mode 0700, file mode 0600). Narrative can contain sensitive information; do not upload bundles without reviewing them.

Lookup accepts only a reference exposed in that bundle. It checks the original bytes against their hash and returns a bounded page, with `nextOffset` when more remains. It never follows paths mentioned inside tool output. Original transcripts must remain available. This is not recovery of tool output that Pi never persisted.

The reader reports malformed or incomplete trailing records as gaps and exits nonzero. Fix the source or wait for the writer before retrying. It does not silently skip invalid lines. This is a full-snapshot replay, not a resumable live tailer. `metrics.workerCoverage` separately counts delegate calls, linked child streams, and linked user/assistant events; these counts do not prove every launch was captured (calls can be declined or retried, and children can fail with no narrative). `gaps: []` certifies only that the files opened parsed.

## Observed extraction results — 2026-09-27

Decimal bytes; source JSONL includes reasoning and extension metadata, not only model-visible text.

| Corpus | Eligible source bytes | Model-facing feed bytes | Retained | Extraction time |
|---|---:|---:|---:|---:|
| pi-packages parent + 7 pi-delegate workers, through 04:15 UTC | 5,323,125 | 167,931 | 3.15% | 27 ms |
| Historical Hop parent only | 116,734,655 | 1,865,231 | 1.60% | 280 ms |

Local source locators:

- `~/.pi/agent/sessions/--Users-ssweens-src-pi-packages--/2026-09-26T23-49-53-444Z_01a0e020-12a4-7474-819f-ad784bb5febd.jsonl`
- `~/.pi/agent/sessions/--Users-ssweens-src-hop--/2026-08-21T05-58-12-150Z_01a022e5-f9b6-7035-9185-99cfaeb07f15.jsonl`

Smoke checks compared all 67 nonempty user/assistant messages and all 511 tool calls plus 511 results in the first frozen corpus against raw sources. Text matched exactly; no tool payloads appeared in the routine feed. A recorded tool error was recovered through lookup. An unknown reference was rejected.

A separate small parser exercise checked fork-message counting despite intervening metadata, a resumed worker with a different `startIdx`, exclusion of future messages, deterministic replay, source-mutation rejection, and incomplete-tail reporting. These are local parser checks, not model-quality evidence.

Type-check the experiment separately (the package's existing check does not include `experiments/`):

```sh
./node_modules/.bin/tsc --noEmit --target ESNext --module ESNext --moduleResolution bundler --types node --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax experiments/*.ts
```

## Blind map-reading probe

A fresh `openai-codex/gpt-5.6-luna:low` scout read only the frozen pi-packages feed, with evidence lookup available. Run: `scout-ef256db3-0429-46b8-ac74-28bb78bdb54b`. Its input excluded Tether's saved ledger and full tool payloads.

- It recovered the broad design changes and used lookup to identify a TypeScript syntax failure hidden in tool output (`s0:164c6f5b`).
- Its first answer was a design summary, not an operational map, and repeated an earlier persistent-session proposal as current.
- After a prompt correction, it separated the original request from current work and listed seven worker assignments/findings. This is qualitative evidence, not a graded accuracy result.
- Citation checking rejected 5 of its 28 distinct references: they did not exist in the feed. It also called the last proposal an accepted direction, although the frozen prefix ended before the user's final approval.
- It made eight lookup attempts, including invalid references, despite the requested two-page limit. The source reader rejected unknown references; the model did not reliably obey its lookup budget. Its own final report understated the lookup attempts.

The recorded cumulative usage for the probe and correction was about 74.1k uncached input, 663.6k cached input, and 3.6k output tokens; nominal provider cost was $0.0324 on the approved Codex subscription route. This measures an interactive read-only probe, not an always-on Mom.

**Initial verdict:** extraction supports the slimmer-input hypothesis. Autonomous map reliability did not pass. The next experiment below adds checked references and enforced lookup limits. More raw tool output would not fix fabricated references.

## Dedicated chronological Mom replay

`mom-replay.ts` uses **`openai-codex/gpt-5.6-luna`, low reasoning**, through Pi's `ModelRuntime`, without a delegate role prompt, extensions, or project tools. Astra contributed earlier architecture advice; it was not the replay model. There is no model fallback.

Each batch contains the previous accepted map and only the next events. Earlier prompts and replies are discarded between batches. Mom can propose a map patch or inspect referenced source evidence; it cannot browse arbitrary files. Native tool-result messages carry lookup results and rejected patches back within a batch.

The host enforces:

Code owns facts it already knows. The model owns interpretation.

- **Host-owned facts:** the original purpose is the first user message, copied verbatim before the first model call. References accumulate: Mom cites 1–6 sources for each change, and the host keeps earlier sources on that record. Once a user message is cited, it stays traceable.
- **Provenance checks:** numeric references into the already-observed prefix; no future sources. User-direction claims need a lead user message or `user_answer`; tool-evidence claims need an inspected tool source. `accepted` is only for user direction. These checks establish provenance, **not semantic support**.
- **Required updates:** each new user message or answer must be cited by an upserted record. Each worker with new narrative must have its branch upserted and cite that new narrative. Worker stream keys are their branch IDs.
- **Aging review:** up to six active records untouched for two or more batches must be corrected, superseded, or explicitly confirmed. Code chooses which records to recheck; Mom judges them. `--no-review` disables this rule.
- **Transactions and repair:** a rejected patch leaves the accepted map unchanged. All violations are reported together. One repair asks Mom to resubmit the same patch with only those corrections.
- **Backlog:** if a batch is rejected after repair, the map stays unchanged and those events are retried once with the next batch. A second consecutive rejection, or a rejected final batch, stops the run. Events are never skipped.
- **Limits:** two evidence-page attempts per batch, including failures, of up to 4,000 characters each; the lookup tool disappears when the allowance is exhausted. At most four model calls per batch, 40 per run, a 90,000-character request-context check, and a 20,000-character map limit. Exceeding a limit stops the run rather than silently truncating history.

These are experiment controls, not settled live scheduling or memory policies. Local map validation limits record text to 2,000 characters and notes to 350. Provider schemas do not cap prose length: run G produced several cut-off records at the earlier 500-character schema limit.

### Reproduce

From `pi-tether/`, export the parent source listed above through the final approval, then run:

```sh
./node_modules/.bin/tsx experiments/slim-replay.ts export /absolute/session.jsonl /tmp/new-approved-bundle --until 2026-09-27T04:28:13.257Z
./node_modules/.bin/tsx experiments/mom-replay.ts plan /tmp/new-approved-bundle --checkpoint s0:760b8f61 --consult s0:164c6f5b
./node_modules/.bin/tsx experiments/mom-replay.ts run /tmp/new-approved-bundle /tmp/new-mom-run --checkpoint s0:760b8f61 --consult s0:164c6f5b
```

Grade a finished run against a rubric (no model calls):

```sh
./node_modules/.bin/tsx experiments/mom-grade.ts /tmp/new-mom-run experiments/rubrics/pi-packages-approved.json /tmp/new-approved-bundle
```

`mom-grade.ts` checks the verbatim original; each rubric decision recorded in the expected state and citing its source in the first committed map that includes it; worker branch lifecycle (open while running, closed after the worker's stop message); the consult answer from inspected evidence; that every user message remains traceable; completion; and no cut-off records. Checks marked heuristic are regular-expression checks for known stale content. `reviewWatchHits` lists matches for review and is not scored. The rubrics are in `experiments/rubrics/`.

`plan` makes no model calls. `run` requires configured authentication for the exact model and a new output directory. It saves configuration, event references, requests, responses, evidence, rejections, committed batches, and a summary in private files. Original source transcripts must remain available for lookup.

The frozen corpus has 1,094 events from the parent and seven workers. Eight batches end at events 113, 217, 467, 744, 958, 1055, 1093, and 1094. The explicit checkpoint separates the slim-feed proposal from the user's approval. A final consult requests the cause of historical tool failure @244; it is not a test of spontaneous detection.

### Observed tuning results — 2026-09-27

All runs used Luna-low. These are successive tuning attempts on the same corpus, **not independent evaluation samples**. Costs are nominal provider metadata on the subscription route, not invoices or live overhead forecasts.

| Run | Model calls | Events committed | Seconds | Nominal cost | Result |
|---|---:|---:|---:|---:|---|
| A | 2 | 113 | 25.5 | $0.00478 | Rejected malformed loose-JSON patch. |
| B | 6 | 744 | 53.1 | $0.01513 | Blocked lookup beyond allowance. |
| C | 4 | 467 | 61.3 | $0.01193 | Native tools; rejected user-direction claim citing only an assistant. |
| D | 11 | 1,094 + consult | 131.4 | $0.02603 | Completed structurally; stale state and duplicate records remained. |
| E | 14 | 1,094 + consult | 153.2 | $0.03000 | Completed with three repairs; stale current purpose and pending-worker state remained. |
| F | 2 | 0 | 23.9 | $0.00497 | Rejected inconsistent worker ID/association after one repair. |
| G | 11 | 1,094 + consult | 111.4 | $0.02513 | Completed without repairs or notes; stale constraints and incomplete prose remained. |
| H | 12 | 1,093 | 128.9 | $0.02630 | Final approval patch rejected twice: current-purpose references omitted the new approval. |

Local evidence is retained under `/tmp/mom-tuned-replay-{a,b,c,d,e,f,g,h}-20260927/`. The input bundle is `/tmp/mom-slim-approved-20260927/`. These temporary paths are evidence locators, not durable storage guarantees.

Run G used 94,225 input and 5,236 output tokens, with no recorded cache reads. It retained all seven worker branches, marked the slim-feed direction proposed before approval and accepted afterward, and recovered the historical TypeScript failure through lookup. It nevertheless left an earlier full-stream constraint active and several records unfinished. No emitted notes establishes silence on this corpus, not useful reminder behavior.

Run H used 92,993 input, 6,099 output, and 19,200 cache-read tokens. Its final candidate correctly cited @1094 for the accepted slim-feed decision, but reused only old references for current purpose. The host rejected the entire patch, retained the map through @1093, and did not run the final consult. This is evidence of a working rejection boundary, **not a successful approval update**.

Direct smoke checks on the final code exercised eleven transactional rejection cases, fresh-reference acceptance, worker refresh targets, chronological boundaries, removal of the exhausted lookup tool, failed-read accounting, third-read rejection, and recovery of TS1005 from the real source. The saved H summary matched its last committed batch exactly after failure. The four experiment files passed the separate TypeScript check above.

### Tuning runs I–L and held-out evaluation — 2026-09-27

The fixed rubric was written after runs G and H. It therefore inherits hindsight from this corpus. Runs I–L changed the harness, not the model:

- **I** (`$0.0076`, stopped at batch 2): the six-reference cap made Luna drop earlier user-message citations. This led to host-accumulated references.
- **J** (`$0.0036`, stopped at batch 1): harness bug; it demanded a citation for @1 even though the host-owned original already cited it.
- **K** (14 calls, `$0.0304`, 151 s): completed and passed all lifecycle and provenance checks, with 27/27 user messages traceable. Review found that approvals given through `ask_user` were missing from the feed. The feed contract was fixed. Bundle v2 is `/tmp/mom-slim-approved-v2-20260927/`.
- **L** (14 calls, `$0.0280`, 151 s): 12/12 on the fixed rubric. Manual review still found a duplicate Astra branch that said “no response yet” after the worker returned, and two gaps that later work had resolved.

**Held-out sessions.** Rubrics for two unrelated parent-only sessions were written from user messages and answers **before** Mom ran on them. Neither has pi-delegate workers, so worker lifecycle is not exercised.

- **buzz** (strip Buzz into the `tipsy` Nostr client): 1,626 events and 7.16% of source bytes. First run, before aging review: 13/14 after the any-record-type grader correction. It recorded every dialog decision, answered the hidden `re.sub` TypeError consult, and kept 32/32 user messages traceable. It left “own relay(s) first” active after the user asked for any relay to be addable. Three stale open records also remained.
- **ssmp** (skill-suite upgrade with live REAPER checks): 903 events and 5.29% of source bytes. The rubric was written after the aging-review change was frozen. Run A exposed a repair regression: the repair fixed one error and dropped a correct supersession. Grouped violations, minimal repairs, and backlog retry followed. Run B completed at 11/13; both misses were grader regex false negatives on review.

The grader originally required decision-type records; buzz recorded one user direction as a branch. It now accepts any record type except purpose records. All runs were regraded with the same code.

**Aging-review sweep** on the final harness. Scores are raw, including known regex false negatives:

| Corpus | Aging review | Runs | Mean score | Active / total records | Calls | Nominal cost | Seconds |
|---|---|---:|---:|---:|---:|---:|---:|
| pi-packages (tuning) | on | 3 | 11.33 / 12 | 20.3 / 33.0 | 12.7 | $0.0288 | 165 |
| pi-packages (tuning) | off | 2 | 12.00 / 12 | 31.0 / 42.5 | 14.0 | $0.0302 | 175 |
| buzz | on | 3 | 12.33 / 14 | 17.0 / 31.0 | 14.0 | $0.0317 | 164 |
| buzz | off | 2 | 12.00 / 14 | 21.5 / 34.5 | 13.0 | $0.0290 | 150 |
| ssmp | on | 3 | 11.67 / 13 | 17.0 / 29.7 | 13.7 | $0.0314 | 208 |
| ssmp | off | 2 | 11.50 / 13 | 24.5 / 38.0 | 12.0 | $0.0274 | 155 |

All 15 runs completed. Three used one backlog retry. Aging review reduced active records by about 30% at roughly 5% more nominal cost. With these sample sizes, the rubric scores show no reliable difference. The buzz relay contradiction remained active in 2/2 runs without review and 1/3 with review; this is weak evidence.

**Overhead relative to the working agents.** Mean Mom usage was 0.28% of recorded agent tokens for the pi-packages parent and workers, 0.16% for buzz, and 0.35% for ssmp. Where cost was recorded, nominal cost was 0.25% for pi-packages and 0.12% for ssmp. Buzz recorded no cost. This is batched offline replay: live Mom would process smaller, more frequent batches and repeat the map more often. That overhead is unmeasured.

Evidence directories are `/tmp/mom-tuned-replay-{i,j,k,l,m}-20260927/`, `/tmp/mom-heldout-{run-a,run-b,ssmp-run-a,ssmp-run-b}-20260927/`, and `/tmp/mom-sweep-*-20260927/`. Held-out bundles are `/tmp/mom-heldout-{buzz,ssmp}-20260927/`.

Smoke checks on the final code exercised these paths:

- 12 transactional rejection cases; the map stayed unchanged each time.
- Grouped violation reporting.
- Reference accumulation.
- Review satisfied by confirmation.
- `user_answer` as a required user-direction source.
- Oldest-first bounded review selection.
- Evidence-budget accounting and recovery of TS1005 from the real source.

All experiment files pass the separate TypeScript check.

**Verdict of the original replay: tracking provenance and explicit user decisions is close to reliable on these three corpora. Retiring stale records is not.** A later, case-tuned offline review-selection experiment improved four labeled transitions; see below. It is not live reliability validation.

What works across corpora:

- Verbatim original and current purpose.
- Every user message and dialog answer remains traceable.
- User decisions are recorded as accepted with their source, usually in the first map that includes them.
- Proposals stay proposed until approved.
- Worker branches are open while running and closed after return.
- Hidden tool-output facts are recovered when asked.
- Evidence lookups stay within budget.

What still fails:

- Earlier records contradicted by a later user direction can stay active.
- Branches can stay open after reported completion.
- An early delegation plan can be recorded as a branch separate from the worker it produced.

These failures are semantic. Valid sources do not prevent them. Regex heuristics catch some, and manual review found the rest. Before live integration, the next proof must measure stale-record rate directly, from labeled supersession events, on more unseen sessions, including one with pi-delegate workers.

## Stale-record transition experiment — 2026-09-27

GPT-6 Astra reviewed four source-labeled failures: Buzz's “own relays first” after “any relay addable,” a pi-packages parent-only progress limitation after the typed feed, a pending Astra consult after the worker returned, and SSMP's pending fixture generation after the lead reported generated assets. Astra initially suggested a delta-first prompt; a revised, narrower checklist first handled required user citations and then reviewed stale records. The checklist did **not** beat the baseline in controlled one-batch replays, so it was not adopted as the default prompt.

`rubrics/stale-transitions.json` labels the older source, replacing source, and stale claim. `rubrics/supersession-controls.json` protects unrelated user choices. `stale-grade.ts` inspects the saved pre/post maps, reports only transitions where the stale claim existed in the saved pre-map, and prints the matching records for manual review. Its regex checks are heuristics, not semantic proof. Each controlled run restores the **same saved pre-transition map** (`--seed-run`, `--seed-batch`, `--single-update`); no future map leaks into the checkpoint. All listed runs committed their target batch without a replay failure.

The concrete failure was partly selection: oldest-first aging review did not select the just-created Buzz relay record when the user changed scope one batch later. It also missed the separate “Astra hasn't returned” placeholder, even though the worker branch itself closed. A case-tuned **review selector** (`--review-variant relevant`, baseline prompt unchanged) ranks active records by rare-word overlap with new narrative regardless of age, reserves up to two review slots for pending-return claims when a worker reports a stop, and fills remaining slots with older records. It only asks Mom to reconcile; it never retires records automatically. This is an experiment in `experiments/`, not a production change.

| Transition | Baseline oldest-first | Prompt checklist | Final relevant-review trials | Preserved controls in final trials |
|---|---:|---:|---:|---:|
| Buzz relay | 0/3 retired | 0/3 | 3/3 | 6/6 |
| Pi-packages pending Astra | 0/2 | 0/2 | 3/3 | 2/3 |
| SSMP fixtures | 2/3 | 1/3 | 2/2 | 2/2 |
| Pi-packages progress limitation | 2/3 | 2/2 | 1/1 | no control due at this checkpoint |

“Retired” means no active match in the first committed map after the replacement event. One Astra trial kept the slim-feed proposal in `proposed` state but failed to cite its tentative user source on that proposal; the source was cited elsewhere. The control failure is a provenance defect, **not** evidence that the proposal disappeared. In the Buzz trials, Mom superseded the compound own-relay/Tauri record and retained Tauri as an accepted part of the current purpose; the private wire-format decision remained accepted. These are small, post-hoc tuned trials, not independent samples. SSMP has only two trials of the final selector; earlier selector variants are excluded. The lexical match may miss paraphrases or elevate unrelated records, and pending-return language does not establish which worker resolved which branch. None of these runs establishes live latency or long-horizon reliability.

Reproduce a controlled transition with the saved private bundles, source transcripts, and seed runs still present:

```sh
./node_modules/.bin/tsx experiments/mom-replay.ts run /tmp/mom-heldout-buzz-20260927 /tmp/new-relevant-buzz --seed-run /tmp/mom-heldout-run-b-20260927 --seed-batch 1 --single-update --review-variant relevant
./node_modules/.bin/tsx experiments/stale-grade.ts /tmp/new-relevant-buzz experiments/rubrics/stale-transitions.json experiments/rubrics/supersession-controls.json
```

Compare with the same command without `--review-variant relevant`. The replay saves the exact prompt, selected review IDs in each request, patches, source refs, and usage. The `tsx` process may remain open after saving `summary.json` due to a runtime handle; some test invocations required an external timeout. Judge a run by its saved summary and committed batch, not the external timeout's exit code.

**Next gate:** label new transitions in at least one untouched session with complete pi-delegate worker histories, include false-retirement controls and consult/source fidelity, then replay without changing selector rules. An attempted untouched candidate (`/tmp/mom-holdout-friction-20260927/`) is **not** suitable: its parent contains 12 delegate tool calls, but the owner-index extractor found only two child sessions. One has a user request and no substantive assistant output; the other only has a session header. Earlier delegate results in the parent point to `/Users/ssweens/.pi/agent/sessions/delegate/`, a legacy storage layout not followed by this extractor. `gaps: []` there means no parse failure in the files read, **not** complete worker capture. The first call was also a declined launch, so 12 calls does not mean 12 workers ran. Do not count this candidate as a held-out worker test or silently treat the missing child narrative as observed. If an intact independent corpus fails, use explicit source-backed branch/replacement relations rather than further lexical prompt tuning. Do not wire this selector into live Tether on these four tuned labels.

## Replacement-snapshot comparison — fixed before running

The user agreed to test a simpler state representation after the ledger experiment stopped converging. `--state-mode snapshot` replaces a short markdown working page each batch; source transcripts retain history. It keeps the host-owned original request, current purpose, active/parked work and return obligations, governing decisions, and unresolved questions. It uses the same feed, chronological batch boundaries, Luna-low model, bounded evidence access, and one structural repair as the patch replay. No required user-message citations, worker upsert gates, accumulated references, aging review, or keyword selector run in this mode. References in the page are range-checked; their meaning is not mechanically certified.

**Fixed comparison:** one full replay per existing corpus (pi-packages, Buzz, SSMP), including the original hidden-output consult. Compare against saved oldest-first runs `mom-tuned-replay-m-20260927`, `mom-heldout-run-b-20260927`, and `mom-heldout-ssmp-run-b-20260927`. Read the snapshots and source prefixes at the four existing transition labels and five preservation controls, plus the decision checkpoints in the existing corpus rubrics. Check that unresolved work and return paths survive, changed claims are replaced without losing unaffected decisions, proposal/approval authority and specific sources remain clear, and lookup answers are supported. Report omissions as failures, not retirement successes. Record completion, calls, usage, page size, and unsolicited notes. The old every-user-cited/retain-every-worker-forever score is not the snapshot contract and must not be reused as an accuracy score.

The prompt in `mom-snapshot.ts` is frozen for this comparison. Do not tune and rerun on these outcomes. No live integration, archive-import work, model substitution, or claim of independent evaluation: these corpora are already familiar. This comparison chooses whether replacement state is worth keeping, not whether Mom is ready to ship.

From `pi-tether/` (output directories must be new):

```sh
./node_modules/.bin/tsx experiments/mom-replay.ts run /tmp/mom-slim-approved-v2-20260927 /tmp/mom-snapshot-v1-approved --state-mode snapshot --checkpoint s0:760b8f61 --consult s0:164c6f5b
./node_modules/.bin/tsx experiments/mom-replay.ts run /tmp/mom-heldout-buzz-20260927 /tmp/mom-snapshot-v1-buzz --state-mode snapshot --consult s0:55485000
./node_modules/.bin/tsx experiments/mom-replay.ts run /tmp/mom-heldout-ssmp-20260927 /tmp/mom-snapshot-v1-ssmp --state-mode snapshot --consult s0:b3315acd
```

### Replacement results — one fixed run per corpus

All three completed without structural repairs or backlog retries. The exact prompt is saved in each `configuration.json`; no prompt or model changes followed the results. Initial source SHA-256: `36e924f42e93dbfa867da3a22075b2cb3076cc80c874a4afccdcab054166a6c4`. A local validator bug was fixed afterward: `@1-999` had checked only the first endpoint. No recorded output used an invalid range, and all 26 recorded snapshots passed the corrected validator without modification. This is not another model trial.

| Corpus | Calls, patch → snapshot | Final state chars, patch → snapshot | Nominal cost, patch → snapshot | Snapshot seconds |
|---|---:|---:|---:|---:|
| pi-packages | 12 → 10 | 11,392 → 4,109 | $0.02631 → $0.02644 | 198.7 |
| Buzz | 12 → 11 | 11,738 → 4,450 | $0.03160 → $0.02921 | 181.8 |
| SSMP | 13 → 9 | 11,697 → 3,656 | $0.02828 → $0.02230 | 151.4 |

State sizes compare serialized patch records against markdown pages, so part of the reduction is schema overhead. Total nominal replay cost fell from $0.08619 to $0.07795 (~10%); input plus cached input fell from 356,184 to 228,497 tokens while output increased from 21,407 to 26,877. This is not live cost or latency evidence.

**Observed improvement:** all four labeled claims existed before the transition and were replaced in the first following snapshot:

- Buzz batch 1's own-relays-first scope became **any relay URL addable** in batch 2, with Tauri and private kinds retained.
- Pi-packages batch 4's lack of worker-progress transport became the approved in-process milestone feed in batch 5.
- Pi-packages batch 6's waiting Astra assignment became a returned report in batch 7; no second pending-Astra placeholder survived.
- SSMP batch 5's missing fixtures/pending generation became generated assets and completed exercises in batch 6, while the genuinely pending final review remained pending. By batch 7 the final review and commit/push were reported complete.

These are inspected pre/post snapshots on familiar cases, **not** four independent reliability trials. Current/parked frontend-versus-Rust work in Buzz and unresolved original-project/live-proof limitations in SSMP remained visible. All three final historical consults cited the requested source, recovered its recorded error through lookup, and did not turn it into a current blocker. Buzz nevertheless over-attributed its error (see below). It also used its two-page allowance in an earlier batch; evidence limits held.

**Failures retained in the record:**

- **Rewrite omission:** the explicit “any relay URL must remain addable” requirement survived Buzz batches 2–5, then disappeared in batch 6 and remained absent. Generic “relay/community behavior” and relay-testing work survived, but do not substitute for that specific requirement. No own-relays restriction returned. Replacement fixed the immediate contradiction but introduced a different retention failure.
- **Authority ambiguity:** before final approval, pi-packages batch 7 called the slim feed a candidate, but also described it as “must” under governing decisions. Batch 8 correctly recorded the explicit approval. The pre-approval snapshot is internally ambiguous, not a clean authority pass.
- **Citation loss:** the SSMP reviewer-cadence correction was remembered at its first checkpoint but omitted the specific user source @567. Other rubric decisions were recognizable at their immediate checkpoints, often with broad source ranges; that is not a claim that every continuing decision kept precise provenance through every rewrite.
- **Consult over-attribution:** Buzz's inspected traceback only names `sub()` and an argument-count error; the answer named `re.sub` without inspecting the calling code. The recorded error was recovered, but that extra causal claim was unsupported.
- **Too much advice:** 11 of 26 snapshot updates emitted notes, versus 1 across the three saved patch runs. Most repeated already-visible work or cautions; one merely announced that a consult answer had been added. The quiet-by-default requirement failed despite the prompt.

**Decision:** replacement snapshots are a simpler, promising working-state representation; do not invest further in keyword retirement rules. This experiment does **not** establish that a freely rewritten page alone safely retains durable decisions, or that Mom's unsolicited advice is useful. Keep the unchanged results for those two concrete defects rather than tuning this prompt into another case-specific pass. Live Tether remains untouched. General historical lookup after a fact leaves the snapshot was not exercised; the three consults supplied exact source references.

All runner writes were awaited; a standalone Node wrapper exited after module completion because `ModelRuntime` exposes no disposal method and the earlier runner could linger. The first wrapper attempt failed CLI argument parsing before any model invocation; the corrected wrapper ran each corpus once. Experiment typecheck, all 26 recorded snapshots under the corrected validator, and the existing 22 Tether tests passed.

## Source-backed replacement — retention and quiet advice

**Hypothesis:** earlier user directions should be re-readable source data, not only a model's repeated summaries. `userTurns()` indexes exact lead user messages and dialog answers, including the original dialog question and a reference to the preceding assistant proposal. Each update receives only the earlier prefix; new directions are already in the new-event batch. This is not a selected/normalized decision database or a second model pass. The three corpora contain only 2.8–5.9k characters of user text plus dialog questions (before reference formatting).

`note` now carries `{text, obligationRef, triggerRef}` or null. Mom must identify an existing obligation and new evidence of a conflict or omission. Ordinary waiting, incomplete verification while work proceeds, or a missing final summary belongs in the page, not an interruption. Host checks establish that the sources exist, the trigger is a new, later agent action (assistant narrative or an inspected tool call/result), and any tool source was actually inspected; they cannot prove the warning is useful. User messages and dialog answers can establish obligations, not offending actions. The model must judge agent behavior against the latest user direction, preserving unaffected constraints. Nothing is filtered by keywords or task-specific patterns.

**Fixed acceptance checks before these runs:**

1. Buzz's any-relay requirement and unaffected Tauri/private-kind/agent-mention decisions survive every later snapshot, including the final consult; SSMP retains user scope and protected-original boundaries; proposal/approval remains distinct in pi-packages.
2. No unsolicited notice on ordinary activity in the three real replay corpora; an actual unaddressed conflict found in the sources must be adjudicated rather than mechanically treated as noise.
3. Initially, three explicit synthetic violations in `rubrics/snapshot-notices.json` must produce sourced notices, while three normal-work/resolved-conflict/changed-scope controls stay quiet. The first run caught all violations but falsely warned about the explicit user scope change, citing the user as the trigger. The authority correction is evaluated on all six again, plus two counterexamples (ignoring the revised direction and violating an unaffected constraint), three repetitions each. All five violations must warn; all three controls must stay quiet. These are authored probes, not fabricated historical transcript evidence.
4. All replays commit their final event; input includes no future user messages; evidence limits and atomic replacement remain intact. Compare calls, cost, and context growth against snapshot v1. User history grows with user turns, not tool output; the existing context limit stops explicitly rather than truncating it. Long-session scalability is not established by these corpora.

Use the same three `--state-mode snapshot` commands with fresh output directories. V1 output and exact saved prompt remain the baseline. Source-backed replacement takes over snapshot mode instead of adding another prompt-variant branch. No live integration or historical-import changes are included.

### Source-backed results and corrections

All runs use `openai-codex/gpt-5.6-luna:low`. These are repeated experiments on familiar corpora, not unseen validation.

- **V2**, `/tmp/mom-snapshot-v2-fixed-{approved,buzz,ssmp}`: all three completed, zero notices across 26 updates, relay requirement retained at the final checkpoint. Three violation probes warned, but one of three controls failed: Mom warned about a user-approved scope change. Total nominal replay cost: $0.083674. The earlier directories without `fixed` contain zero-cost schema preflight failures: Pi rejects explicit object/null unions; its optional-object schema supplies the nullable field.
- **V3**, `/tmp/mom-snapshot-v3-authority/`: notices now require an agent action, judged against the latest user direction. Five violation cases and three controls ran three times each: **15/15 violations warned, 9/9 controls stayed quiet**, all on the first response. Revised-direction and unaffected-constraint violations cited the latest user source, not the superseded instruction. The three real replays again produced zero notices across 26 updates. However, the approved replay invented seven pending scouts and Buzz again guessed `re.sub` from a result that named only `sub()`.
- **Input corrections, reviewed with GPT-6 Astra:** `renderBatch()` had repeatedly presented all historical actors inside `newEvents`. It now labels only actors occurring in the current batch; an empty consult has no actor roster. Explicit historical-failure consults preload the result and matched invocation, using same-stream `callId`, not adjacency. Both reads count against the existing two-page budget; no extra model pass. Missing or truncated invocation evidence cannot establish a deeper cause.
- **V4**, `/tmp/mom-snapshot-v4-evidence/`: Buzz and SSMP completed; all eight notice probes passed once more. Pi-packages completed its event stream but the consult was rejected twice: the citation parser misread `@ssweens/pi-tether@0.1.0` as source `@0`. The parser now recognizes standalone citation tokens rather than embedded package versions. The actual rejected candidate passes the corrected parser, while standalone zero, future, and reversed references still fail. A full pi-packages rerun, `/tmp/mom-snapshot-v4-evidence-approved-fixed`, completed without repairs.

The final recorded runs are:

| Corpus | Events | Updates / model calls | Final page / user-history chars | Nominal cost | Seconds |
|---|---:|---:|---:|---:|---:|
| pi-packages, corrected rerun | 1,094 | 9 / 9 | 4,323 / 7,330 | $0.027475 | 199.7 |
| Buzz | 1,626 | 9 / 9 | 3,178 / 4,212 | $0.026348 | 146.0 |
| SSMP | 903 | 8 / 8 | 3,126 / 3,796 | $0.022929 | 142.1 |

All 26 updates were silent, with no repairs or deferred batches. Each explicit consult used exactly two evidence pages and one model call. Total nominal cost was **$0.076752**, versus $0.077952 for snapshot V1; this small difference is not a controlled performance gain. Peak request context was 36.3–39.1k characters, below the explicit 90k stop. User-history prefixes were checked against each request's start event; no later user message was exposed there. These are offline costs and elapsed times, not live overhead or subscription bills.

**Observed outcomes:**

- Buzz retains any/arbitrary-relay support through the final consult, together with Tauri/private kinds and the later agent-mention requirement. Text-presence checks covered every later batch; the final page was read, not accepted solely on those checks.
- Pi-packages no longer invents seven newly pending scouts at approval or consult. Its final page records the architecture scout as returned and the slim direction as explicitly approved at @1094.
- SSMP retains the full-roadmap scope, owned-fixture/original-project boundary, reported commit/push endpoint, and residual live-proof limits.
- Buzz's paired evidence now identifies the local `sub(old,new)` helper and its three-argument invocation. Pi-packages reports compiler syntax errors without guessing the missing source construct. SSMP reports a broken-link validation failure without claiming a deeper implementation cause.

**Limits remain visible:** pre-approval prose still mixes a proposed design with prescriptive “governing” language. The final pi-packages page retains an uncertain separate external-consult caveat; it is not proof of another outstanding worker. Buzz sometimes uses `【number】` instead of the requested `@number` notation: those numeric references were range-checked separately for this run, but the host validator only checks the `@` grammar. Free-text citations, authority, and semantic completeness are not certified. General historical search after facts leave the page, live scheduling/recovery, long-session user-history growth, and independently complete worker corpora remain outside this proof.

**Decision:** keep replacement working state plus verbatim chronological user direction, source-backed notices, and bounded paired evidence for explicit failure questions. Do not return to accumulating ledgers, keyword retirement, or worker reporting. This experiment settles the candidate representation and demonstrates bounded notice behavior; it does not certify every summary claim or authorize a live cutover. Private artifacts preserve the failed runs and exact prompts alongside the successful outputs.

## Boundaries of this proof

Byte reduction is not a model-cost benchmark. Approximate tokens use characters divided by four, not a tokenizer. Recorded actor cost is provider metadata, not necessarily money billed on a subscription. Full Mom cost also includes repeated instructions/map input, output, and evidence investigations.

The old Hop session uses other subagent tooling. Its result measures the parent only, not full worker coverage. Attachments and facts buried in tool output are not interpreted.

A live implementation must process new entries without rescanning full history on every check, keep model work off the lead's execution path, and expose backlog. This experiment does not establish live latency, long-horizon memory accuracy, advisory quality, outage recovery, or Mom's operating budget. Do not wire it into the live extension as though those questions were settled.
