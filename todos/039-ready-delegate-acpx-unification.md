---
status: ready
issue_id: "039"
tags: [pi-delegate, pi-strings, acpx, architecture, hub]
dependencies: []
forked_from: ""
---

# Fold pi-strings into pi-delegate as its ACP backend

## Where we are

trunk: 039 — fold-in approved 2026-09-30; Pi 0.99 dependency bump across all packages in flight (prerequisite for 041)
tangents: native Amp plugin deployment → separate 031 gate; does not block the fold-in

## Findings

- Decision 2026-09-30 (session 01a0eba6, lines 2928–2930): pi-delegate owns the only Coordinator; pi-strings code moves into pi-delegate. Supersedes the earlier two-package plan (shared-instance lookup vs import), which had a double `COORDINATOR_OWNED` lock and version coupling.
- pi-strings' own code is small: ~2.1k lines in `extensions/pi-strings/` (Coordinator 1060). Bulk is vendored `vendor/acpx`, `vendor/pi-acp`, `vendor/amp-acp`, `vendor/amp-plugin`, plus committed `dist/acpx-runtime` built by `tsconfig.acpx.json` and `scripts/build.mjs`.
- pi-acp workers are full Pi processes; pi-strings stays out of them via `PI_STRINGS_WORKER=1` / `PI_STRINGS_OPENED=1`. pi-delegate must honor the same guard or ACP Pi workers get `delegate` and can recurse.
- Run identity: a pi-delegate run spans many turns; a pi-strings request is one turn. ACP runs must keep worker name, request IDs, native ID (Amp `T-…`), delivery (`accepted`/`unknown`) and provider outcome distinct — accepted ≠ finished.
- Tool names never collided (`delegate`/`delegate_ctl`/`todo` vs 12 `op_*`); after fold-in the `op_*` tools retire (053).
- All packages move to Pi `>=0.99.1 <0.100.0` (pi-omp pattern, `9e905a1`); installed Pi is 0.99.2. This removes the version conflict 045 was filed for.

## Children / execution graph

- 040 — ready — backend-neutral contract + `op_*` → delegate mapping decision
- 041 — ready — move pi-strings code/vendor/tests into pi-delegate, green in new home
- 042 — ready — `delegate` dispatches `pi` or `acp`; depends on 040, 041
- 043 — ready — lifecycle controls across backends; depends on 042
- 044 — ready — native Amp/Orb opening through `delegate`; depends on 043
- 045 — ready — pi-delegate installs and loads alone on Pi 0.99 with ACP deps; depends on 041
- 053 — ready — retire the pi-strings package and `op_*` tools; depends on 044, 045
- 046 — ready — contract/install tests; depends on 043–045
- 047 — ready — docs; depends on 042, 043
- 048 — ready — live smoke; depends on 046, 047, 053

040 and 041 run in parallel. 045 and 042 follow 041.

## Outcome

A Pi user installs one package and invokes one surface, `delegate`/`delegate_ctl`. It runs ordinary Pi children in-process or ACPX/provider children externally, with honest backend-specific lifecycle and result evidence.

## Context

Preserve pi-delegate's durable child runs, roles, model selection, steering, cancellation and run logs. Preserve pi-strings' ACPX permissions, provider adapters, native session identity, Orb/local execution, bounded requests and no-recursive-orchestration policy. ACP children must not pretend to be in-process Pi sessions. Open pi-strings todos (021, 024, 026–031) reference `pi-strings/` paths; repoint them when 041 lands.

## Acceptance criteria

- [ ] `delegate` selects `pi` (default, unchanged) or `acp` through a documented contract.
- [ ] ACP delegation returns delegate run IDs/results and maps lifecycle controls without losing provider evidence.
- [ ] Amp native `T-…` opening and Orb/local settings remain exact and explicit.
- [ ] Only pi-delegate is installed; pi-strings is retired with history preserved.
- [ ] Contract tests, install smoke and authorized real-provider smoke pass.

## Out of scope

Amp visibility/multiplayer administration, plugin author identity, replacing ACPX, converting external sessions into Pi child sessions.

## Evidence

Architecture approved 2026-09-30 (extend pi-delegate with ACPX backends); fold-in approved the same day. Plan commit `fb9c6cf`. Hindsight initiative: `kp-064d029437dd4bc385e63d3656e3c6d1`.
