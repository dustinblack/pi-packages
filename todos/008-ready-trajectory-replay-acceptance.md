---
status: ready
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
- [ ] Mom's maps are scored against the labels per case
- [x] No prompt tuning between scoring runs
- [x] Results and failures are preserved with paths

## Findings / Evidence

- Bundles with 1,094, 1,626, and 903 events were recovered and hashed; safe manifests and label artifacts are under `pi-tether/experiments/trajectory-acceptance/`.
- Astra and Sol initially agreed on 13/15 labels; blind MiMo adjudication produced 15/15 matching-pair gold labels.
- V1 scored 3/15, but is **inconclusive** because of temporal-horizon and structural-classifier P1s. Raw private evidence was removed from reachable history and remains only under `/private/tmp/todo-008-trajectory/private-v1-inconclusive/`.
- V2 preregistered aligned semantic scoring. Five of 15 horizons are reusable; ten require additional production replay.
- The bounded replay was cancelled for latency/transport before producing a valid result. The safe harness ends at `e458242`; acceptance remains pending, with no production prompt change.
- Resume prerequisite: the user promotes this pending todo after a stable bounded replay path is available. Do not create another todo.
