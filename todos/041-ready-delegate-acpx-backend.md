---
status: ready
issue_id: "041"
tags: [pi-delegate, pi-strings, acpx, move]
dependencies: ["039"]
forked_from: "039"
---

# Move the pi-strings ACP runtime into pi-delegate

## Outcome

pi-strings' Coordinator, ACPX runtime, providers, vendored sources and tests live in pi-delegate and pass there. pi-delegate becomes the only place a Coordinator is constructed.

## Context

- Move with `git mv` so history follows: `pi-strings/extensions/pi-strings/**` → `pi-delegate/src/acp/**`, `pi-strings/vendor/**` → `pi-delegate/vendor/**`, and `tests/**` (incl. fixtures and integration) → `pi-delegate/test/acp/**`. Bring the build: `tsconfig.acpx.json`, `tsconfig.vendor.json`, `scripts/build.mjs`, and the committed `dist/acpx-runtime` + `dist/pi-acp.js` + `dist/amp-acp.js` convention. Keep `LICENSE`/`NOTICE.md` attributions for the vendored code.
- Runtime deps join pi-delegate: `@agentclientprotocol/sdk`, `proper-lockfile`, `write-file-atomic`, `zod`; dev: esbuild and the `@types/*`.
- Depends on the Pi 0.99 bump being green in both packages first.
- At this step, pi-delegate does not register `op_*` tools and does not dispatch to ACP; that is 042. The pi-strings extension entry stays loadable until 053 retires it.
- Guard: pi-delegate's extension must return early when `PI_STRINGS_WORKER=1` or `PI_STRINGS_OPENED=1`, as pi-strings does (`index.ts:16`). Otherwise ACP Pi workers receive `delegate`.

## Acceptance criteria

- [ ] All moved pi-strings tests pass under pi-delegate's test runner; pi-delegate's existing suite stays green.
- [ ] `npm run typecheck` in pi-delegate covers the moved code and the vendor tsconfig.
- [ ] A test proves the extension registers nothing under `PI_STRINGS_WORKER=1`.
- [ ] `git log --follow` on a moved file shows its pi-strings history.
- [ ] No second Coordinator construction path exists.

## Out of scope

Tool surface changes, deleting the pi-strings directory (053), renaming `PI_STRINGS_*` env vars.

## Evidence

Pending implementation.
