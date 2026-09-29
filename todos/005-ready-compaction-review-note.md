---
status: ready
issue_id: "005"
tags: [mom, pi-tether, compaction]
dependencies: ["003"]
---

# Mom checks every compaction against her map and posts one note if something active was dropped

## Outcome

After every compaction, Mom checks the result against her map. If something still active was dropped or distorted, such as the purpose, a rule, a hold, a return point, or current work, she posts one short note that the lead sees on its next request.

## Context

- The user asked for this: "any sizable move… like a compaction event should definitely warrant the mom reviewing that compact, make sure it's still consistent and adheres to our current map" [5753].
- The user chose option **B** [5840]: one note right after compaction, for example "still in force — don't modify KEEP.txt; after the auth tangent, return to the formatter wording". The note does not start a lead turn and uses the existing notice delivery.
- Currently the `session_compact` hook has been removed, and nothing implements the note.
- Compaction summaries can be empty provider placeholders ("OpenAI remote compaction applied…" in 6 of the making-mom thread's 17 compactions). Compare the map against the raw replaced segment, not the summary text.
- The note is a delivered message. Mom's state still lives only in the sidecar.

## Acceptance criteria

- [x] A compaction wakes exactly one Mom update, within the 003 budget
- [x] Test: a compaction that drops an active hold produces exactly one plain-English note naming it
- [x] Test: a compaction that keeps everything active produces no note
- [x] Test: an empty-summary compaction is reviewed against the raw replaced segment
- [x] No lead turn is started; the note reaches the lead on its next request
- [x] Live capture of one real compaction review

## Review finding

- P1: repeated compactions started raw capture at the prior compaction entry. Pi's next replaced context begins at that prior compaction's `firstKeptEntryId`, so active raw messages between that entry and the prior compaction record could be omitted from review.

## Evidence

- Substantive implementation: `608e83a` (`feat(pi-tether): review compactions with Mom (todo 005)`).
- Raw mechanism: `session_before_compact` captures the exact branch entries from the preceding compaction boundary through `firstKeptEntryId`; active-map sources are rendered first into the bounded review input. `session_compact` binds the actual summary and compaction trigger to that immutable capture.
- Notice flow: dropped active material saves one sidecar-only `nextRequest` advisory. Input/start hooks append it without `triggerTurn`; notice-key persistence deduplicates delivery. Later background updates retain it until delivery.
- Real SDK/runtime capture: `pi-tether/experiments/evidence/todo-005-real-compaction-capture.json`. It records one compaction-review request, raw hold recovery, one omitted non-active raw event due to the 36,000-character bound, next-input delivery, no notice-created lead call, and no Mom state records in session JSONL.
- `cd pi-tether && npm run check` — typecheck passed; 102 tests passed, 0 failed.
- `cd pi-delegate && npm run check` — typecheck passed; 38 tests passed, 0 failed.
- `git diff --check` — passed before the substantive commit.
- `git push origin main` — pushed `2cca2b1..608e83a` to `main`.
