---
name: create-pr
description: Run all quality checks, bump version, commit, push to a feature branch, and create a GitHub PR. Use when the user says "create PR", "push", "submit PR", "залить", "сделай PR", or wants to finalize and ship changes.
---

# Create PR

Finalize current changes: fix code quality issues, bump version, commit, push, open a GitHub PR, and monitor CI live.

## Process

### 1. Guard: must be on `main` or a feature branch

```bash
git branch --show-current
```

- If on **`main`** → proceed to Step 2 to create a branch.
- If on a **feature branch** → skip Step 2, proceed straight to Step 3. Do NOT create a new branch unless the user explicitly asks for one.

---

### 2. Create a feature branch (only if on `main`)

Look at `git status` / `git diff --stat` to suggest a branch name, then:

```bash
git checkout -b feat/<short-description>   # or fix/ / refactor/ / chore/
```

Ask the user to confirm or change the suggested name before creating.

---

### 3. Determine what changed → bump version

Run `git diff --stat HEAD` to understand the scope. Classify:

- **Bug fix only** → patch bump (`npm version patch --no-git-tag-version`)
- **New feature** (with or without fixes) → minor bump (`npm version minor --no-git-tag-version`)
- **Breaking / major** → ask the user first, never bump major silently

If unsure, ask: "This looks like a feature/fix — should I bump minor or patch?"

---

### 4. Initial snapshot commit (restore point)

Stage and commit everything so there is a safe restore point before any auto-fix tools run:

```bash
git add -A
git commit -m "wip: initial snapshot before checks"
```

If nothing to commit, skip silently.

---

### 5. Build — fix if needed

```bash
npm run build          # Vite client build
npm run build:server   # tsc -p tsconfig.server.json
```

If **errors**: read the output, fix the affected files, re-run (max 3 attempts). Commit each fix attempt:

```bash
git add -A
git commit -m "fix: resolve build errors"
```

If still failing after 3 attempts: **stop**, show the remaining errors and ask the user how to proceed.

---

### 6. Lint with auto-fix

```bash
npm run lint:fix
```

Check if any files changed (`git diff --name-only`).

- If files changed: show the diff, ask the user — "lint:fix made changes. Shall I commit them and continue?"
  - Yes → `git add -A && git commit -m "fix: apply lint:fix"`
  - No → stop and let the user review.
- If no changes: continue.

---

### 7. Prettier auto-fix

```bash
npm run format
```

Check if any files changed.

- If files changed: commit automatically **without asking** (prettier changes are always safe):

```bash
git add -A
git commit -m "style: apply prettier format"
```

- If no changes: continue.

---

### 8. Final verification

Re-run build to confirm the tree is clean after formatting:

```bash
npm run build && npm run build:server
```

If clean: continue. If not: fix and commit as in Step 5.

---

### 9. Final commit

```bash
git add -A
git commit -m "<type>: <short description>"
```

Types: `feat`, `fix`, `refactor`, `chore`, `style`, `docs`. Use the most significant type. Include a brief body if the title isn't self-explanatory.

If `git status` shows nothing to commit (all changes already committed in fix steps) — skip silently.

---

### 10. Push

```bash
git push -u origin <branch-name>
```

---

### 11. Create the PR

```bash
gh pr create --base main --title "<same as commit message>" --body "<brief description>"
```

PR body should include:

- What changed (bullet points)
- Version bump (e.g., "1.3.0 → 1.4.0")

Capture the PR URL and show it to the user.

---

### 12. Monitor CI — live stream

```bash
gh run list --branch <branch-name> --limit 1 --json databaseId --jq ".[0].databaseId"
gh run watch <run-id>
```

`gh run watch` streams live step-by-step progress. Wait for it to complete, then fetch the final conclusion:

```bash
gh run list --branch <branch-name> --limit 1 --json databaseId,conclusion
```

---

### 13. Handle CI result

**If CI passed (`success`):**

```
✅ CI passed! PR is ready: <PR URL>
```

Switch back to main:

```bash
git checkout main
git pull origin main
```

**If CI failed (`failure`):**

```bash
gh run view <run-id> --log-failed
```

- Parse the errors. Attempt to fix them the same way as Step 5.
- After fixing: commit, push, go back to Step 12 to monitor the new run.
- **Max 2 auto-fix attempts.** If still failing: show errors and ask the user for guidance. Do NOT switch to main.

---

### 14. Report to user

Tell the user:

- All local checks passed
- Version bumped (from → to)
- PR URL
- CI result (passed / failed / auto-merged)

---

## Important rules

- **NEVER skip quality checks.** Build + lint + format must all pass before the final commit.
- **NEVER push to `main` directly.** It's protected — always use a feature branch + PR.
- **NEVER read or print `.env` contents** — it contains secrets.
- **Always switch back to `main` after CI passes.** This is non-negotiable.
- If `gh` CLI is not authenticated, tell the user to run `gh auth login` first.
- If there are uncommitted changes when starting, include them in the PR (don't stash).
