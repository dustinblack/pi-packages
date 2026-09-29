# V2 aligned semantic trajectory protocol (pre-registration)

Status: pre-registered before any v2 semantic scoring, scorer dispatch, or additional production replay. This document does not authorize provider calls.

## Fixed study inputs and gate

V2 keeps the same 15 cases, finalized labels, immutable bundles, movement definitions, and pass threshold registered in v1. It does not alter or revalidate a gold label. The immutable inputs remain identified by `manifest.json` and `labels/final-gold.json`.

The movement vocabulary is:

- **accept** — explicit assent adopts a previously proposed direction without otherwise changing its scope.
- **expand** — add compatible durable scope while preserving the governing purpose and existing scope.
- **contract** — narrow or remove scope, permission, or an alternative while preserving the governing purpose.
- **redirect** — replace or park the current course in favor of materially different work; the original session purpose remains grounded.
- **reorganize** — preserve purpose and scope but change structure, sequencing, focus, or the route/point of return.

Status quo preserves all unaffected purpose, scope, obligations, alternatives, and unresolved return points. A case earns one point only when the final blind semantic movement equals its existing final gold label. There is no partial credit. Pass still requires at least **12/15 overall** and at least **4/5 in each transcript**. Any critical-gate violation fails the run. Any missing, invalid, unclassifiable, or unresolved/unknown result remains an acceptance gap and cannot be counted as a pass.

No production prompt, replay input, case, label, threshold, scorer packet, adjudication rule, or scoring instruction may be tuned after scoring starts. Additional production replay exists only to reach the predeclared horizons; it may not change prompts or other production settings.

## Aligned horizons

For each case, the score horizon is the chronologically latest decisive evidence ref already named by that case's gold validator record. Chronology is determined mechanically by the immutable bundle feed, not array position in the label file. The complete derivation and input hashes are in `horizon-coverage.json`.

A production after-map is eligible only if Luna consumed evidence through exactly that horizon ref. A later snapshot is not substituted because it contains post-horizon evidence. The scored before-map is the snapshot immediately before the case's registered boundary; the scored after-map ends at the aligned horizon. Existing exact snapshots may be reused. Every matrix row marked `needs-additional-production-replay` requires a production replay to its exact horizon before a scorer packet can be made. No semantic movement may be inferred from the coverage exercise.

## Blind semantic scoring

The structural classifier in `classifier.ts` is retired from acceptance scoring. It may be run only as a clearly labeled graph-diff diagnostic; its output must not enter a scorer packet, vote, adjudication, point, or critical gate.

Two independent models score every case in fresh contexts. They must not be Luna, use OpenRouter, or have participated in gold validation. The two models must be distinct model families; their model/provider identities and packet hashes are sealed privately before dispatch. A third model satisfying the same restrictions and distinct from both initial models is sealed as adjudicator before any first-round result is opened.

Each model receives exactly one packet conforming to `semantic-scorer-packet.schema.json` containing only:

1. the five movement definitions and status-quo rule above;
2. the case's evidence no later than its aligned horizon; and
3. sanitized before/after production maps, checkpoint IDs, map hashes, and consumed-through refs.

Packets use opaque scorer case IDs. They contain no gold label, coverage name, validator identity, validator rationale/result, previous scorer result, vote count, structural-classifier output, raw provider request/response, reasoning trace, threshold, or aggregate score. Sanitization removes all fields outside the strict packet schema. Packet generation must verify that the last included evidence event and after-map `consumedThroughRef` both equal the registered horizon and that all graph source refs are available no later than that horizon.

Each model returns one strict `semantic-scorer-result.schema.json` object. It independently assigns one movement and evaluates all three typed critical gates:

- `unsupported_current_purpose`
- `revived_rejected_alternative`
- `lost_unresolved_return`

Every movement and gate finding cites evidence refs and relevant graph node IDs and canonical edge IDs (`from|relation|to`); an empty ID list is allowed only when the rationale explains why no graph element identifies the finding. Gate verdicts are `clear`, `violation`, or `unknown`. `unknown` is never coerced to `clear` and remains an acceptance gap.

## Agreement and adjudication

Agreement is evaluated independently for the movement label and each of the three gate verdicts. A matching pair is final for that field. Rationale text and citation arrays need not be byte-identical, but all final citations must exist in the packet and all node/edge IDs must exist in one of its maps.

A field without a matching first-round pair is sent blind to the sealed third model using the original packet, never the prior outputs. A matching pair among the three is final. If all three values differ, all three models independently re-read the original packet with no other model's output or identity and return a replacement result. That field is final only on unanimous re-read. Failure to reach unanimity is an unresolved acceptance gap; it is not scored or silently defaulted.

Only after all packets and model outputs are immutable and hashed may an offline join reveal existing gold labels and compute the unchanged numeric gate. Provider/model calls, additional replay, and that join are outside this preregistration commit.
