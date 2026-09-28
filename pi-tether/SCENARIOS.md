# pi-tether scenarios

Real situations the tool must survive, each stress-tested against the current design: tether's ledger and widget, plus mom as a trailing observer. Grounded in 60 days of measured pi sessions and the known roadmap. A scenario is the test; if the design fails one, the design changes, not the scenario.

Verdicts: **holds** · **bends** (works, with a named cost) · **breaks** (fails as designed).

## The context mechanism these scenarios assume

Measured on the user's longest sessions (tokens ≈ chars/4): a 504-turn, 21-day session is 80 MB, 97% of it tool results. With tool results excluded, a digested turn (user text + lead text + one line per tool call) is p50 ~450, p90 ~1.7k, p99 ~4–5k, worst 12k tokens. A delegate's brief is p50 21 tokens, its final report under 1.2k; its transcript is 20–50× larger. Principles subset (Non-Negotiables + Operator Profile) ≈ 1.7k tokens.

- **Memory is a code-owned structured ledger, not prose the model rewrites.** Threads (capped fields) plus up to 24 typed notes (decision · constraint · hazard · open, ≤200 chars each). Nothing is lost without an explicit drop; code enforces every size.
- **Each check is a fresh, stateless call.** Input: principles ≤2k + ledger state ≤2.5k + delta ≤6k + git status ≤600. Typical 4–7k tokens in, worst ~12k, output ≤400. Flat for the life of the session.
- **The delta is built by code from a cursor** (the last entry id mom saw) over raw session entries, so the main session's compaction never hides anything from her. User text head 400 + tail 100 tokens; lead text 300 per message; tool calls as one-line names; delegates as brief + report + status from pi-delegate's run record, never the transcript. Over 6k: newest 3 turns full, older turns one line each, oldest dropped with a count.
- **Mom returns typed ops, not a rewrite:** `{ops, notes, note}`. Code applies each op through the same validator as the tether tool; an invalid op is dropped, a stale snapshot is re-queued, lead and user changes win.
- **Backfill is bounded:** the last 40 turns as one-liners + the last 3 in full + pi's latest compaction summary if it is real (≥500 tokens).
- **Retrieval is for consults only:** "why did we do X?" searches the session and child files on demand.


---

## A. The core loop

### A1. The 13-day session
One pi session runs for two weeks across ~13 topics (measured: hop, 239 messages, 13 days; 626 compactions across 60 sessions). Mom has been observing since day one.
- **Must:** on day 13, mom still knows the original purpose, which threads closed and why, and what is open — without her own context having grown with the session.
- **Design:** mom's memory is a bounded state document rewritten each check.
- **Verdict: holds, with the ledger-as-memory mechanism.** Per-check input stays ~4–7k tokens on day 1 or day 13. Decay can't happen silently: a fact leaves only through an explicit drop op or capped eviction (resolved opens first, constraints last). Invented history is bounded to what a typed op can express, and a user or lead correction wins. It would have **broken** with the prototype's persistent session (input grows every check toward ~256k, then pi's own compaction rewrites mom's memory) or a model-rewritten prose summary (silent loss on every rewrite).

### A2. "Also, X is broken" mid-task
While the agent fixes the rail, the user types "Also, the terminals are stacking" (measured: 48 such messages). Often it is the same UI area.
- **Must:** answer or record without switching; keep same-area issues on the trunk; separate work becomes an open thread.
- **Design:** tether rules handle this in the lead; mom notices at the next pause if the lead absorbed separate work silently.
- **Verdict: holds for the lead, bends for mom.** Mom sees it one pause late. Fine: she is a safety net, not the first line.

### A3. A question treated as work
User asks "what is GhosttyKit??" and the agent starts editing (measured: 5 explicit complaints; ~32 jargon questions).
- **Must:** answer, don't execute.
- **Design:** tether rule; pi-omp's todo reminder can override it (it fires a "continue working" follow-up after a declarative answer).
- **Verdict: bends.** Tether's rule is correct but pi-omp's reminder, still on, undoes it. Mom cannot fix this — it happens inside one turn. Needs pi-omp's todo feature off during the trial (user's toggle).

### A4. "??" while the agent is 40 minutes into a tool loop
Measured: ~80% of status pings are mid-run impatience.
- **Must:** instant answer, no interruption.
- **Design:** tether answers locally from live state.
- **Verdict: holds.** Mom is not involved and should not be — a model call here is latency the user is already complaining about.

### A5. Back after a night away
User returns 9 hours later (measured: 73 gaps over 8 hours) and types "status?".
- **Must:** where we are, why, what's open, what's next — without re-reading the transcript.
- **Design:** tether re-injects the ledger; the lead answers; mom's latest note sits in the widget; `/mom` gives her view.
- **Verdict: holds, if A1 holds.** Also watch the overlap with pi-recap, which fires its own recap on idle return — two recaps is noise.

### A6. The user changes the purpose mid-session
"Forget the rail — this session is about notifications now."
- **Must:** re-anchor the root without losing the old trunk; mom's future checks measure drift against the new purpose, not the old one.
- **Design:** the ledger's root is rewritable; mom must accept a stated purpose change as authoritative, not flag it as drift.
- **Verdict: bends.** Real risk: mom sees the new direction, compares it to her stored purpose, and nags "you've drifted from the rail". Needs an explicit rule: a user-stated change of purpose is a purpose change, not drift.

### A7. A tangent that turns out to be the real work
A what-if about OpenCode support becomes three days of work (measured: the hop session's harness detour).
- **Must:** re-parent retroactively; the old trunk becomes a parked child.
- **Design:** tether supports re-activation; mom (if she owns the ledger) must recognize the promotion.
- **Verdict: bends.** Mom classifying "this is now the trunk" from observation alone is judgment she will sometimes get wrong. The lead or user must be able to overrule her in one move.

---

## B. Subagents

### B1. Five delegates in flight
Lead delegates a scout, two workers, a reviewer, and a model-choice research run at once (measured: ~101 delegation mentions).
- **Must:** mom knows what each is for, which thread spawned it, and when each result returns; nothing is left hanging.
- **Design:** mom reads pi-delegate's run record for each child (brief, status, final report, changed files) — written atomically, readable in flight. The child's session file lives at `<cwd>/.agents/pi/subsessions/`. The child→thread link comes from the `delegate` result in the main session (its run id and session path) and the thread active when it was called.
- **Verdict: holds.** Five delegates cost her a few hundred tokens: briefs are ~21 tokens at p50, reports under 1.2k. She never reads transcripts in a check.

### B2. A worker drifts
A worker asked to fix a CSS bug starts refactoring the renderer.
- **Must:** someone notices before the diff lands.
- **Design:** mom can read the child's session file in flight; she can only speak to the lead, not the child.
- **Verdict: bends.** She catches it at the lead's next pause, possibly after the worker finished. She cannot steer the child directly; the lead must (`delegate_ctl steer`). Acceptable: the lead already reviews every diff.

### B3. A delegate's result is never folded back
The scout returns findings; the lead moves on without using them.
- **Must:** mom flags "scout #3 returned, not acted on".
- **Design:** mom sees the completion in the main session and the thread still open.
- **Verdict: holds.** This is exactly her job and cheap to detect.

### B4. pi-strings workers (Codex, Claude, Amp through ACPX)
The roadmap: heterogeneous workers via pi-strings.
- **Must:** mom sees them like delegates.
- **Design:** mom reads pi-delegate run records; pi-strings workers keep their own ACPX sessions elsewhere.
- **Verdict: breaks.** Mom is blind to pi-strings workers. She sees only the lead's calls and results. Either she learns pi-strings' state files, or v1 states the limit plainly.

---

## C. Trajectory conflicts

### C1. Hop's Fixer already does part of this
Hop's Fixer is a resident concierge that holds the Op overlap graph, fed from git truth, and advises without gating.
- **Must:** one resident advisor per workspace, not two giving different advice.
- **Design:** mom is pi-session-scoped; the Fixer is Space-scoped.
- **Verdict: breaks, eventually.** Inside Hop, a pi session with tether+mom running as an Op would have two advisors: its own mom and the Space's Fixer. The long-run answer is probably that mom *is* the Fixer's role generalized — or that tether defers to the Fixer when running inside Hop. Decide before Hop adopts tether.

### C2. Many pi windows in one repo
The user runs three pi sessions in the same repo (measured: long sessions per project, plus side sessions).
- **Must:** each mom is scoped to her session; they don't fight over the working tree.
- **Design:** one mom per session.
- **Verdict: bends.** Three moms each see the same dirty working tree and each suggest cleaning it. "Unexplained files" must be scoped to files this session touched; otherwise every mom nags about every other session's work.

### C3. Claude Code sessions
Some work happens in Claude Code (measured: 51 transcripts in the window, ~6% of human messages).
- **Must:** at least not contradict.
- **Design:** mom is pi-only.
- **Verdict: holds as a stated limit.** Work done in Claude Code is invisible to mom; she only sees its effects in git.

### C4. Hindsight ingests mom's own session
Hindsight retains every session transcript in the repo's bank.
- **Must:** mom's private checks don't pollute project memory.
- **Design:** mom's session lives under `~/.pi/agent/tether-mothers/`, outside the repo.
- **Verdict: holds, with stateless checks.** A fresh, unpersisted call per check leaves no mom transcript for Hindsight to ingest. Her memory lives as custom entries in the main session, which Hindsight already retains. The prototype's persistent mother session would still need this checked.

### C5. Widget crowding
pi-omp todo, pi-delegate agents panel, pi-recap, and tether all draw above the editor.
- **Must:** stay readable.
- **Verdict: bends.** Four widgets stack. Tether + pi-delegate is fine; pi-omp todo should be off during the trial; pi-recap's idle line overlaps mom's role (A5).

---

## D. Mom herself

### D1. Mom is wrong
She claims a thread is abandoned when it was deliberately parked, or invents a decision that was never made.
- **Must:** wrongness is cheap: visible, overrulable, never acted on automatically.
- **Design:** advisory only; never edits.
- **Verdict: bends.** If she owns the ledger, a wrong classification changes the trail everyone reads. Her ledger writes need to be visible diffs the lead/user can reject, and user or lead corrections must win.

### D2. Mom nags
Same "clean your room" three pauses in a row.
- **Must:** say it once; stay quiet until something changes.
- **Design:** declined notes aren't repeated.
- **Verdict: holds, if implemented as a hard rule** (fingerprint the note; suppress duplicates until the facts change).

### D3. Provider down / model misbehaves
- **Must:** tether keeps working; the failure is visible once, not every pause.
- **Design:** ledger independent of mom; mom errors notify.
- **Verdict: bends.** Current prototype notifies on every failed check — noisy during an outage. Back off after one failure.

### D4. Cost
One model call per pause; a busy day has 200+ pauses.
- **Must:** bounded, visible, cheap.
- **Design:** skip when nothing new; cheap model tier.
- **Verdict: holds, on a small model.** ~6k in / 300 out per check over a 500-turn, three-week session ≈ 3M input tokens — trivial on a small fast model. Mom must **not** inherit the lead's model and thinking level (here gpt-5.6-luna at xhigh); that would be the expensive mistake. Checks run only when there is a new user turn or a delegate settled.

### D5. Secrets in transcripts
The main thread or a child transcript contains an API key or a pasted credential.
- **Must:** mom doesn't copy secrets into her state doc or notes.
- **Verdict: bends.** Digested deltas exclude tool results (where most secrets live), but user messages can contain them. Mom's prompt must say never to restate credentials; her state doc must not quote raw text.

### D6. Mom consulted by the lead on every turn
The lead learns that calling `mom` feels safe and calls it constantly.
- **Must:** consults are rare and purposeful.
- **Verdict: bends.** Needs tool guidance ("consult when returning from a tangent, before delegating, or when unsure of purpose") and possibly a per-turn cap.

### D7. Mom is inert until the lead uses tether
The prototype only wakes mom after a tether op or a delegate receipt.
- **Must:** she observes from the first user turn; the lead shouldn't have to do bookkeeping for her to work.
- **Verdict: breaks, in the prototype.** Measured: the lead never used tether-like tools in any historic session. Her trigger must be "a new user turn since the cursor", not "a tether op happened".

### D8. Mom's note never reaches the lead
- **Must:** her note is part of the lead's next turn, once.
- **Verdict: breaks, in the prototype.** Her note reaches only the widget and `/tether check`; `before_agent_start` never injects it. Small fix: inject once, expire after two turns.

### B5. A fork child
A delegate launched with `context: "fork"` copies the parent's whole context into its own session file first.
- **Must:** mom never re-reads the parent through the child.
- **Verdict: holds, reading run records.** Reading child session files naively would re-read up to hundreds of parent messages. The run record carries the fork offset, and mom reads the record, not the file.

---

## E. Handoff

### E1. Handing the effort to someone else
The user wants a colleague to pick up the work.
- **Must:** one digest: purpose, path, decisions, open threads, where things are.
- **Design:** mom's state document is that digest.
- **Verdict: holds, if A1 holds.** This is the strongest argument for mom's state doc being high quality: it doubles as the handoff.

### E2. Starting mom on an already-long session
Tether is installed into a session that is already 150 messages deep.
- **Must:** mom builds her initial state without reading 150 messages raw.
- **Verdict: bends.** Bounded backfill: the last 40 turns as one-liners (~1.6k tokens) + the last 3 in full + pi's latest compaction summary only if it is real. Measured caveat: in one hop session, 12 of 15 compaction summaries were ~60 tokens (near-empty, written by an extension), so the summary can't be trusted as the seed. Mom starts with a thinner picture of anything older than 40 turns and fills gaps through retrieval when consulted.

---

## Summary

- **Breaks:** B4 (pi-strings workers invisible), C1 (Hop Fixer overlap — a trajectory decision), D7 and D8 (prototype bugs: mom inert until tether is used; her note never reaches the lead).
- **Bends, with fixes named:** A3 (pi-omp reminder), A6 (purpose change ≠ drift), A7/D1 (mom's ledger writes must be overrulable), C2 (scope "unexplained files" to this session), D2/D3 (dedupe notes, back off on failure), D5 (no quoting secrets), D6 (consult guidance), E2 (thin backfill beyond 40 turns).
- **Holds:** A1, A2, A4, A5, B1, B3, B5, C3, C4, D4, E1 — A1, B1, C4, D4 only with the ledger-as-memory mechanism above, not the prototype.
