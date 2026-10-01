---
status: ready
issue_id: "045"
tags: [pi-delegate, pi-strings, packaging, compatibility]
dependencies: ["039"]
forked_from: "039"
---

# Align package compatibility and combined installation

## Outcome

Make pi-delegate and pi-strings installable and loadable together on a declared Pi version range.

## Context

Current declarations conflict: pi-delegate requires Pi >=0.86.1; pi-strings declares >=0.83.0 <0.84.0. The installed Pi is 0.99.2. Package manifests, type dependencies, extension loading, and tool schemas need a deliberate compatibility decision.

## Acceptance criteria

- [ ] Supported Pi range is explicit and both packages agree on it, or incompatibility is explicit.
- [ ] `pi install`/pack smoke loads both packages without schema, resource, or dependency collisions.
- [ ] Current local Pi version is covered by the declared range or clearly rejected.
- [ ] No unrelated package dependency is widened without evidence.

## Out of scope

Backend behavior, provider credentials, and publishing a new release.

## Evidence

Pending baseline and compatibility update.
