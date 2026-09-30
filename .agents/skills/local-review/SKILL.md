---
name: local-review
description: Review personal-hub changes and run local validation without publishing.
disable-model-invocation: true
---

# Local review

1. Establish the change set using read-only Git status/diffs and the user's requested base, if supplied. Read root and affected app guidance. Keep staged, unstaged and unrelated changes distinguishable.
2. Inspect changed behavior and relevant consumers. Check app/package dependency direction, app-local data/auth isolation, secrets exposure, domain invariants and regression coverage.
3. Run the smallest relevant existing tests and checks from the root with workspace selectors. For shared-package changes, validate affected apps as well. Use read-only lint/format checks; report failures without automatic fixes.
4. Return high-confidence findings with paths and impact, commands/results, and remaining validation gaps. If no findings are supported, say so without implying untested behavior passed.

Completion: every changed workspace is accounted for and each validation result is grounded in command output. Leave source files, versions and Git state untouched; this skill does not stage, commit, reset, push, create PRs, deploy or monitor remote CI.
