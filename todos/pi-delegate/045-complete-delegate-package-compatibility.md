---
status: complete
issue_id: "045"
tags: [pi-delegate, packaging, compatibility]
dependencies: ["041"]
forked_from: "039"
---

# Install and load pi-delegate with the ACP runtime on Pi 0.99

## Outcome

`pi install` of pi-delegate alone brings `delegate`, `delegate_ctl`, `todo` and the ACP runtime on Pi `>=0.99.1 <0.100.0`, with no load errors.

## Context

Originally filed for the pi-strings (`<0.84`) vs pi-delegate (`>=0.86.1`) conflict. The fold-in plus the repo-wide bump to the pi-omp pattern (`9e905a1`) removes the two-package question. What remains is that the single package ships its vendored runtime and built `dist/` and declares its new runtime deps. Installed Pi is 0.99.2. `pi-delegate/test/install-smoke.ts` is the existing smoke test.

## Acceptance criteria

- [x] `files`/`pi` manifest entries include the moved `dist/`, `vendor/` and skills; the pack contents are verified.
- [x] Install smoke asserts `errors=[]`, the three tools, and that the ACP runtime binaries resolve from the installed package.
- [x] Peer range covers installed Pi 0.99.2.
- [x] No unrelated dependency is widened without evidence.

## Out of scope

Backend behavior, provider credentials, publishing a release.

## Evidence

Closing commit `7bca920`. `command npm run check:install` gives `PASS 151 packaged files, Pi 0.99.1 in >=0.99.1 <0.100.0, isolated pi install with ACP runtime`.
- The pack shrinks from 329 to 151 files. The smoke asserts the required files are present and that tests, scripts and vendor sources are absent.
- The installed copy resolves `dist/pi-acp.js`, `dist/amp-acp.js` and `dist/acpx-runtime/runtime.js` and their externals from its own path. Both adapters answer an ACP `initialize`.
- Each failure mode was checked: removing `dist`, adding `vendor` sources and dropping `write-file-atomic` each fail the smoke.
- Caveat: the smoke installs with dev Pi 0.99.1. The installed 0.99.2 is covered only by the peer range; 048 exercises it live.
