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

The V2 aligned replay finished cleanly and blind semantic scoring ran to the preregistered gate. Outcome: **3/15, zero critical-gate violations, zero unresolved gaps** — against the gate of ≥12/15 and ≥4/5 per transcript. Mom's maps did not match the independently validated movement labels.

## Evidence

- Replay: `pi-tether/experiments/trajectory-acceptance/aligned-replay-manifest.json` — 15 cases, 5 reused v1 snapshots + 10 newly replayed to their exact aligned horizons, 31 Luna calls, 0 gaps. Attempts and harness fixes (transport retry, refresh-path deterministic retry, two-phase lineage-correct before/after maps, raised caps) are recorded in `REPLAY-RUNS.md`.
- Packets: 15 blind cases (≤4.8k evidence chars each), packet sha256 `fa5b0e99f7e485a51eaf88cbe4469014c80e47b6b15ce6090a045ee77af726aa`. Scorer/adjudicator identities sealed before dispatch (`/private/tmp/todo-008-trajectory/private-v2/sealed-identities.json`); every result hashed in `locked.json` before the offline join.
- Scorers: `openai-codex/gpt-5.6-terra` + `opencode-go/kimi-k3` (distinct families; subscription providers per the user's direction; never Luna, never OpenRouter, no gold-validator participation). Sealed adjudicator `opencode-go/glm-5.3`. Agreement: the two scorers matched on 12/15 movements, 3 movement fields were decided by the adjudicator, and nothing remained unresolved — no unanimous re-read was needed.
- Verdict: `pi-tether/experiments/trajectory-acceptance/semantic-score.json`. Raw provider requests/responses, rationales, and the sealed identities stay private; only safe metadata is committed.
- Runs: tether 137/137, delegate 40/40.

### Why the number needs careful reading

The blind distribution differs from gold: expand 7 vs 1, accept 2 vs 5, contract 2 vs 4, redirect 4 vs 3, reorganize 0 vs 2. The scorers agreed with each other 12/15, so the pair is internally consistent while systematically disagreeing with the gold set's movement semantics. The preregistered gate is a strict label match, so the protocol reports fail — but the distribution shift says the two scorer pools do not share semantics. Follow-up filed as todo 037 (scorer calibration). Mom's runtime, prompt, and retrieval are unchanged by this todo.

- Closing commits: `bf6690d` (aligned replay) plus the scoring/join scripts and verdict in this commit.

## Findings / Evidence

- Bundles with 1,094, 1,626, and 903 events were recovered and hashed; safe manifests and label artifacts are under `pi-tether/experiments/trajectory-acceptance/`.
- Astra and Sol initially agreed on 13/15 labels; blind MiMo adjudication produced 15/15 matching-pair gold labels.
- V1 scored 3/15, but is **inconclusive** because of temporal-horizon and structural-classifier P1s. Raw private evidence was removed from reachable history and remains only under `/private/tmp/todo-008-trajectory/private-v1-inconclusive/`.
- V2 preregistered aligned semantic scoring. Five of 15 horizons are reusable; ten require additional production replay.
- The bounded replay was cancelled for latency/transport before producing a valid result. The safe harness ends at `e458242`; acceptance remains pending, with no production prompt change.
- Resume prerequisite: the user promotes this pending todo after a stable bounded replay path is available. Do not create another todo.
