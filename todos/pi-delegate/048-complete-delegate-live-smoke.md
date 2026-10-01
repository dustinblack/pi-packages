---
status: complete
issue_id: "048"
tags: [pi-delegate, acpx, smoke]
dependencies: ["046", "047", "053"]
forked_from: "039"
---

# Prove unified delegation on real Pi and ACP providers

## Outcome

The installed pi-delegate, with pi-strings gone, runs end to end: one ordinary Pi child and one authorized ACP/provider child, plus the existing Amp Orb/native path where credentials permit.

## Context

Fixtures cannot prove process boundaries, provider identity, native executor preservation or user-facing attribution. Keep prompts read-only. Use only existing approved targets, not fresh scratch threads: the user objected on 2026-09-30 to custom test threads left behind as a mess.

Approved targets (user, 2026-10-01):
- Existing max-planner Orb thread `T-01a0f0b4-5330-714f-a024-0a156279b832`: open, observe, and one short marker steer. It is multiplayer, so everyone in it sees the marker. Send nothing else.
- One new local Amp thread, created and labeled by delegate, with a read-only prompt, then closed.
- One real Pi child and one non-Amp ACP agent, with read-only prompts.

## Acceptance criteria

- [x] A real Pi child delegates, completes, reports its result and leaves no orphan.
- [x] A real ACP provider child delegates, completes and reports provider/session evidence.
- [x] The existing Amp native/Orb proof preserves the exact T-ID, executor and user attribution.
- [x] Timeout, cancel and disconnect are observed without claiming remote cancellation when it is unknown.
- [x] Anything temporary is cleaned up or archived, with evidence.

## Out of scope

Team-thread mutation, multiplayer changes, plugin deployment, automatic retries after ambiguous delivery.

## Evidence

Live run on 2026-10-01, at `018901d`, real Pi 0.99.2 driving `delegate`/`delegate_ctl` with the user's normal resource loading. All six criteria passed, but only with a workaround (see Blocker).

What passed:
- **Pi child:** `scout-af3e8e22…` → `PI_DELEGATE_PI_CHILD_OK`, with no orphans.
- **Codex ACP:** `codex-16a2604d…`, req `req_e3106866…`, completed with delivery accepted.
- **Orb thread** `T-01a0f0b4-5330-714f-a024-0a156279b832`:
  - opened idle;
  - observe returned 14 messages;
  - one marker `pi-delegate smoke check (automated, please ignore) PI_DELEGATE_ORB_OK` was sent. It shows as `## User`, executor stays orb, and visibility and multiplayer are unchanged;
  - close only disconnected; the thread is unarchived;
  - cost went from $2.12 to $2.45.
- **Local Amp thread** `T-01a0f65d-df8d-723d-87d1-7d515c454720`:
  - labels `<run hex>, pi-delegate` and a title;
  - `PI_DELEGATE_AMP_LOCAL_OK`;
  - cost $0.01;
  - archived after close.
- **Timeout and cancel:** reported honestly (`TURN_TIMEOUT` and cancelled, with delivery unknown).
- **Park and revive:** worked across two processes, for both Codex and the Orb thread.
- **Cost:** about $0.34 metered.

**Blocker (resolved):** the ACP backend worked in only one Pi process per machine, because the machine-wide Coordinator lock gave `COORDINATOR_OWNED` to every other process. The smoke ran with `PI_AGENT_DIR` pointed at a scratch dir. The user chose one Coordinator per process on 2026-10-01; this todo needs re-proof after that fix.

Smaller bugs found are being fixed with review round 2: the Codex native ID is never shown, `[status]` lines leak into reports, a steer after a timeout says `WORKER_BUSY`, a cancel also wakes the parent, and the cost in a wait result is stale.

Logs: the session scratchpad `runA.log` … `runD2.log`.

**Re-proof after the fix**, at `11ae604` (per-process Coordinator `95ac552` plus round-3 claim fixes), real Pi 0.99.2 with the default agent dir, alongside ~27 older Pi processes:
- Two parent processes (PIDs 13874, 13875) ran Codex at the same time, each with its own `proc/<pid>-<token>` state dir. Neither got `COORDINATOR_OWNED`.
- B's open of `T-01a0f0b4…` failed `SESSION_IN_USE … held by Pi process 13874` while A held it. After A closed, B opened it and observed 16 messages.
- The thread export is byte-identical before and after; nothing was posted.
- The locks dir is empty and no processes are left.
- Opening the Orb thread appears to bill Orb runtime (thread total $2.45 → $2.67, with no model calls).

