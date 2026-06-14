---
name: commit-and-pr
description: Create conventional commits and pull request descriptions
---

1. COMMIT

Include files you changed. Keep all irrelevant files and don't delete it.
ACTION: run `git add <specific files>` and `git commit` directly. Never `git add -A`. 
Format: `<type>(<scope>): <summary>` — 50/72 rule, imperative, English. Body explains why, not what. Types: feat/fix/docs/style/refactor/perf/test/ci/build/chore/revert. Breaking: append `!` after type/scope. Co-Authored-By included.

2. PR Description

```
## What this PR does

### Before this PR:

### After this PR:
Fixes #

### Type of change
[type]

### Breaking changes (if any)
```

Omit any section that does not apply. English only.
