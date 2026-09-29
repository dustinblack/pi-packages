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

- [ ] Labels are validated by at least 2 independent models via pi-delegate (not OpenRouter) [6077], and their agreement is reported
- [ ] The pass threshold is stated before scoring
- [ ] Mom's maps are scored against the labels per case
- [ ] No prompt tuning between scoring runs
- [ ] Results and failures are preserved with paths
