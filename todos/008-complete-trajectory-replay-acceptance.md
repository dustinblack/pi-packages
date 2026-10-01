---
status: complete
issue_id: "008"
tags: [mom, pi-tether, acceptance]
dependencies: ["003", "005", "007"]
---

# Mom's maps on three real transcripts match validated movement labels

## Outcome

On three real preserved transcripts, Mom's live prompt produces maps whose movements (pivot, assent, conflict, return, stale) match independently validated labels.

## Context

- This continues making-mom's in-progress item; the replay bundles and labels already exist.
- Labels must be validated: "your measure presumes that YOU broke those trajectories down correctly" [6042]. Consensus across models is acceptable; the user supplies definitions, not labels [6063].
- Use more than the formatter dogfood session [5897].
- Movement vocabulary: accept / expand / contract / redirect / reorganize. Status quo is the default [5811].

## Acceptance criteria

- [x] Labels are validated by at least 2 independent models via pi-delegate (not OpenRouter) [6077], and their agreement is reported
- [x] The pass threshold is stated before scoring
- [x] Mom's maps are scored against the labels per case
- [x] No prompt tuning between scoring runs
- [x] Results and failures are preserved with paths

## Result — FAIL (study complete, answer is no)

The V2 aligned replay finished cleanly and blind semantic scoring ran to the preregistered gate. Outcome: **3/15 (pi-packages 0/5, buzz 3/5, ssmp 0/5)** — against the gate of ≥12/15 and ≥4/5 per transcript. Final movement labels: reused v1 snapshots scored 0/5, freshly replayed cases 3/10. No final gate verdict is a violation and no field was left unresolved, but these implications for map quality are unresolved.

## Evidence

- Replay: `pi-tether/experiments/trajectory-acceptance/aligned-replay-manifest.json` — 15 cases, 5 reused v1 snapshots + 10 newly replayed to their exact aligned horizons, 31 Luna calls, 0 gaps. Attempts and harness fixes (transport retry, refresh-path deterministic retry, two-phase lineage-correct before/after maps, raised caps) are recorded in `REPLAY-RUNS.md`.
- Packets: 15 blind cases (≤4.8k evidence chars each), packet sha256 `fa5b0e99f7e485a51eaf88cbe4469014c80e47b6b15ce6090a045ee77af726aa`. Scorer/adjudicator identities sealed before dispatch (`/private/tmp/todo-008-trajectory/private-v2/sealed-identities.json`); every result hashed in `locked.json` before the offline join.
- Scorers: `openai-codex/gpt-5.6-terra` + `opencode-go/kimi-k3` (distinct families; subscription providers per the user's direction; never Luna, never OpenRouter, no gold-validator participation). Sealed adjudicator `opencode-go/glm-5.3`. Agreement: the two scorers matched on **11/15** movements; **4 movement fields were decided by the sealed adjudicator** (cases 006, 013, 014, 015, all B+C pairs); nothing stayed unresolved and no unanimous re-read was needed. Reused v1 snapshots scored 0/5 and freshly replayed cases scored 3/10, so snapshot reuse is not the explanation — though lineage and batching remain uncontrolled confounds.
- Verdict: `pi-tether/experiments/trajectory-acceptance/semantic-score.json`. Raw provider requests/responses, rationales, and the sealed identities stay private; only safe metadata is committed.
- Runs: tether 137/137, delegate 40/40.

### Why the number needs careful reading

The blind distribution differs from gold: expand 7 vs 1, accept 2 vs 5, contract 2 vs 4, redirect 4 vs 3, reorganize 0 vs 2. The scorers agreed with each other on 11/15 movements, so the pair is internally consistent while systematically disagreeing with the gold set's movement semantics. A parent-run diagnostic (the retired structural classifier over the same 15 map pairs) also scored **3/15** with distribution redirect 9 / expand 5 / accept 1, agreeing with gold on only cases 006 and 008 — so the label vocabulary is not stable across judging configurations. Follow-up filed as todo 037 (scorer calibration). Mom's runtime, prompt, and retrieval are unchanged by this todo.

### Where this record was wrong, and the deeper measurement problem

An independent review (GPT Astra, fresh context) corrected this todo's numbers and found the more fundamental misalignment. Verified corrections now applied: 11/15 first-round agreement with 4 adjudications (not 12/15 and 3); reused 0/5 vs replayed 3/10; the structural classifier distribution is redirect 9 / expand 5 / accept 1; and “both scorers cleared every gate” is false — scorerB flagged `revived_rejected_alternative` as a violation on case-013, and the final clear came from A+C adjudication.

The deeper issue is **boundary versus interval**, not only rubric wording. The gold validators classified the session **at the registered boundary** (evidence only, no maps); the blind scorers classified the map transition **across the whole interval through the aligned horizon**. Case-007 (buzz-assent-01) is the clean example: the gold label excludes the subsequent relay expansion, while the scored interval contains it. Correctly consuming the registered horizon does not make those the same target. Second, gold endorsement does not transfer across tasks: 15/15 validator agreement establishes agreement under their evidence-only task, not correctness for a map-fidelity task. This record therefore states **fail on the label-match gate** and **implications for map quality unresolved** — not “Mom is defective” and not “Mom passed”. Movement labels stay secondary; todo 037 owns the corrected target.

- Closing commits: `bf6690d` (aligned replay) plus the scoring/join scripts and verdict in this commit.

## Findings / Evidence

- Bundles with 1,094, 1,626, and 903 events were recovered and hashed; safe manifests and label artifacts are under `pi-tether/experiments/trajectory-acceptance/`.
- Astra and Sol initially agreed on 13/15 labels; blind MiMo adjudication produced 15/15 matching-pair gold labels.
- V1 scored 3/15, but is **inconclusive** because of temporal-horizon and structural-classifier P1s. Raw private evidence was removed from reachable history and remains only under `/private/tmp/todo-008-trajectory/private-v1-inconclusive/`.
- V2 preregistered aligned semantic scoring. Five of 15 horizons are reusable; ten require additional production replay.
- The bounded replay was cancelled for latency/transport before producing a valid result. The safe harness ends at `e458242`; acceptance remains pending, with no production prompt change.
- Resume prerequisite: the user promotes this pending todo after a stable bounded replay path is available. Do not create another todo.
