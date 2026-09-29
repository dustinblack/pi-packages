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

- [ ] A compaction wakes exactly one Mom update, within the 003 budget
- [ ] Test: a compaction that drops an active hold produces exactly one plain-English note naming it
- [ ] Test: a compaction that keeps everything active produces no note
- [ ] Test: an empty-summary compaction is reviewed against the raw replaced segment
- [ ] No lead turn is started; the note reaches the lead on its next request
- [ ] Live capture of one real compaction review
