---
status: pending
issue_id: "067"
tags: [mom, pi-tether]
dependencies: ["065"]
---

# Mom injection controls persist across reload

## Outcome

The user can turn each injection surface on or off — anchor and window (`/mom inject on|off`), process nudges by class (`/mom nudge all|none|<class>`), and one-session hush (`/mom hush`) — with the setting durable in the sidecar across reload and branch changes.

## Context

- Settled design: `MOM-INTERFACE.md` §3 (repo root).
- The sidecar `control` record shape already exists (`sidecar.ts`, used by `/mom pause`/`/mom resume` in `index.ts`); extend it rather than adding a parallel mechanism. Command registration and the README command table live in `index.ts` and `README.md`.
- Hush silences all injections for the current session without discarding the saved map or pausing background map maintenance — it is delivery control, not tracking control.
- Default posture (surfaces default-on versus flag-gated behind readiness metrics) is an open decision the user owns, `MOM-INTERFACE.md` §5.4; the toggles work either way.

## Acceptance criteria

- [ ] `/mom inject on|off` disables and enables anchor and window injections end-to-end (live or loopback capture)
- [ ] `/mom nudge all|none|<class>` routes process notices by risk class
- [ ] `/mom hush` silences all injections for the current session while background map maintenance continues
- [ ] Control state survives reload and branch changes; injections resume only when re-enabled
- [ ] Deterministic tests cover each control, its persistence, and its interaction with pause/resume
- [ ] `cd pi-tether && npm run check` passes

## Out of scope

- Readiness-gate metrics (open decision, `MOM-INTERFACE.md` §5.4)
