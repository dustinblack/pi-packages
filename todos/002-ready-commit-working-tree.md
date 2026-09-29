---
status: ready
issue_id: "002"
tags: [mom, pi-tether]
dependencies: []
---

# Land the uncommitted Mom working tree on main

## Outcome

The uncommitted Mom work lands on main: sidecar-only state, waking at settled boundaries, the advisor, presentation, and tests. Nothing can be lost, and every later todo starts from a real SHA.

## Context

- The user directed "Reloaded. Commit." [6722]. No commit exists after `b5a3195`.
- The working tree has 26 tracked changes and 8 untracked files. 90 Tether + 38 delegate tests pass.
- The two known review P1s are tracked in 003 (errors reported serially) and 004 (retrieval ranking). They do not block this commit.
- Include `todos/` in the commit.
- Leave `MOM-BRIEF.md` and `tasks/pi-strings-foreground-design.md` untracked.
- Commit the scratch replay and repro harnesses only if docs or tests reference them.

## Acceptance criteria

- [ ] Commit(s) on main, pushed
- [ ] `npm run check` passes in pi-tether and pi-delegate at that SHA
- [ ] The commit message names the known open P1s by todo id (003, 004)
- [ ] `MOM-BRIEF.md` and `tasks/` untouched
