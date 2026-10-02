---
name: create-pr
description: Publish explicitly authorized personal-hub changes through a feature branch and GitHub PR, then follow their CI result.
---

# Create a monorepo PR

1. Read root and affected app guidance. Inspect Git status, the requested diff and `origin`; identify which app/shared workspaces changed. Distinguish the requested changes from unrelated work. Completion: the publication scope is explicit.
2. Confirm the user has authorized committing, pushing and opening a PR. Otherwise prepare a local review only. Reuse an appropriate feature branch; when starting from `main`, create a `dev/dshilov/*` branch. Keep `main` protected and preserve app versions unless the user separately requests a version change.
3. Run the existing root checks for cross-workspace changes, or scoped checks plus affected consumers for a focused change. Use root `package.json` and the CI workflow as the command sources. Include tests, not just builds; run the Astro formatting check when changing Astro templates. Report pre-existing failures separately and fix only issues in scope. Completion: every affected workspace has an explicit result.
4. Review the final diff and stage only authorized paths. Keep credentials, local data and generated output out of the commit. Preserve existing unrelated staged changes. Commit with the required trailers, push the feature branch, and create a PR targeting `main`; describe scope, checks, limitations and any gated automation.
5. Follow the CI run matching the PR's current head, not simply the latest repository run. The aggregate `Build & Lint` must succeed before the PR is ready. Investigate failed jobs without exposing secrets or silently broadening token permissions. Completion: report the actual PR URL and CI outcome, or the concrete blocker.
6. Merge, enable auto-merge or activate deployment only when authorized. Passing CI is not permission to switch production or change app versions. Leave the working branch intact while its PR is open; return to `main` only when the intended merge has completed and the worktree can switch safely.

Owner auto-merge and news deployment have separate rollout gates documented in the root README. The copied legacy `PAT_TOKEN` retains its old permissions; do not assume it grants access to new repository administration.
