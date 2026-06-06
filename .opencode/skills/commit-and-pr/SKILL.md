---
name: commit-and-pr
description: Create conventional commits and pull request descriptions
---

1. COMMIT

ACTION: run `git add <specific files>` and `git commit` directly. Never `git add -A`.
Format: `<type>(<scope>): <summary>` — 50/72 rule, imperative, English. Body explains why, not what. Types: feat/fix/docs/style/refactor/perf/test/ci/build/chore/revert. Breaking: append `!` after type/scope. Co-Authored-By included.
NOTE: commit is automatic. Do NOT push — pushing requires user approval.

2. PR Description — only when user explicitly requests a PR

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
