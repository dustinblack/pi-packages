---
status: complete
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

## Review findings

- P1 (first correction): repeated compactions started raw capture at the prior compaction entry. Pi's next replaced context begins at that prior compaction's `firstKeptEntryId`, so active raw messages between that entry and the prior compaction record could be omitted from review.
- P1 (remaining): the correction searched for a prior compaction only before the new `firstKeptEntryId`. Pi can validly choose that new boundary before the prior compaction record, causing capture to fall back to branch root instead of the prior compaction's `firstKeptEntryId`.

## Evidence

- Substantive implementation: `608e83a` (`feat(pi-tether): review compactions with Mom (todo 005)`).
- Raw mechanism: search backward across the entire selected branch for the latest prior compaction, even when the new `firstKeptEntryId` appears before that compaction record. On a first compaction capture begins at branch root; on every repeated compaction it begins at the latest prior compaction's `firstKeptEntryId`, inclusive, and ends immediately before the new `firstKeptEntryId`. Every still-replaced branch entry is retained in the immutable capture, and active-map source events are rendered first into the bounded review input. `session_compact` binds the actual summary and compaction trigger to that capture.
- Notice flow: dropped active material saves one sidecar-only `nextRequest` advisory. Input/start hooks append it without `triggerTurn`; notice-key persistence deduplicates delivery. Later background updates retain it until delivery.
- Real SDK/runtime capture: `pi-tether/experiments/evidence/todo-005-real-compaction-capture.json`. It records one compaction-review request, raw hold recovery, one omitted non-active raw event due to the 36,000-character bound, next-input delivery, no notice-created lead call, and no Mom state records in session JSONL.
- Review P1 correction: `d50ae02` (`fix(pi-tether): retain repeated compaction raw range (todo 005)`). The regression reconstructs a prior compaction whose active `KEEP.txt` hold is before the prior compaction record but at its `firstKeptEntryId`; the next review now includes that hold and all entries through the new boundary.
- Remaining P1 correction: `6872740` (`fix(pi-tether): search full branch for prior compaction (todo 005)`). The SDK-realistic regression calls Pi's `prepareCompaction` on valid branch ordering and proves Pi can select the new boundary before the prior compaction record; capture still starts at the prior compaction's `firstKeptEntryId`, never branch root.
- `cd pi-tether && npm run check` — typecheck passed; 104 tests passed, 0 failed.
- `cd pi-delegate && npm run check` — typecheck passed; 38 tests passed, 0 failed.
- `git diff --check` — passed before the substantive commit.
- Initial implementation push: `2cca2b1..608e83a`; first review fix: `f16e8ea..d50ae02`; remaining P1 fix: `6198f46..6872740`, pushed to main.
