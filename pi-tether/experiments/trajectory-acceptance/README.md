# Blind production trajectory replay

This directory's phase-4 harness imports production `Mom`; it does not carry an experimental prompt or transaction schema. `Mom` supplies `MOM_PROMPT`, the `openai-codex/gpt-5.6-luna` lookup, low reasoning, required tool choice, background-only `commit_graph`, and the one-proposal/one-repair ceiling.

## Evidence adapter and boundaries

The immutable recovered bundles are already the output of production's exact narrative feed extraction. The adapter admits only chronological lead `user` and `user_answer` evidence authorized by the blind packet/protocol. It does not expose assistant/model output, tool payloads, a future event, or events after a transcript's final selected boundary. For each case it first applies eligible directions strictly before the boundary, snapshots the accepted map, applies the one exact packet boundary event, and snapshots again. Each segment is checked against production's 24,000-character feed limit.

The replay aborts rather than selecting a fallback model, exceeding two calls in an update, making call 41, running beyond 20 minutes, or accepting a packet/feed ref mismatch. Background retrieval is disabled by production `Mom`. It atomically rewrites `raw-predictions.json.partial` after every model response, update success/failure, case, and transcript. A first deterministic failure receives the ordinary production retry; an opened gap receives one explicit production `refresh` attempt, with every failed and repaired update retained in `updates`.

The lost-memory Pi attempt 1 is reconstructed conservatively in `attempt-1-failure.json`: only the observed process error and facts mechanically implied by committed control flow are populated; unavailable maps, usage, and totals remain `null`. With no saved temp session/sidecar, Pi is explicitly attempt 2. Buzz and SSMP remain attempt 1.

## Precommitted classifier

`classifier.ts` uses production graph fields and this precedence:

1. existing hierarchy/parent/non-return-link restructuring → `reorganize`;
2. purpose/focus/current-course/return-focus movement → `redirect`;
3. settled or removed material → `contract`;
4. new durable nodes, links, or intent/label material → `expand`;
5. provenance/observation-only or graph-identical acceptance → `accept`.

Links incident to a new node are expansion. A changed `returns_to` link between existing nodes is a return-focus redirect. This disambiguation is committed before any run.

## Commands

```sh
cd pi-tether
npx tsc --noEmit --target ESNext --module ESNext --moduleResolution bundler \
  --types node --strict --skipLibCheck --allowImportingTsExtensions \
  experiments/trajectory-acceptance/classifier.ts \
  experiments/trajectory-acceptance/replay.ts \
  experiments/trajectory-acceptance/validate-artifact.ts
npx tsx --test experiments/trajectory-acceptance/classifier.test.ts
cd ..
npx tsx pi-tether/experiments/trajectory-acceptance/replay.ts
npx tsx pi-tether/experiments/trajectory-acceptance/validate-artifact.ts
```

After the one run, the three critical-observation booleans are filled by inspection of only packet obligations/source refs and the captured before/after maps. Requests contain no credentials; the committed artifact must pass a secret scan.
