# Contributing

> Development process for the TG News Reader project.

---

## Before every push

All four checks must pass:

```bash
npm run build          # Vite client build
npm run build:server   # tsc -p tsconfig.server.json
npm run lint           # ESLint
npm run format:check   # Prettier (read-only; run npm run format to fix)
```

---

## Git Workflow

`main` is protected — direct pushes are blocked by a GitHub Ruleset. All changes go through a PR.

### Create a branch and open a PR

```bash
git checkout -b feat/my-feature   # branch off main

# ... make changes ...

git add . && git commit -m "feat: short description"
git push origin feat/my-feature
# GitHub will print a PR URL, or use:
gh pr create --base main
```

### ⚠️ After every `git push` — immediately sync local `main`

```bash
git checkout main
git pull origin main        # or: git reset --hard origin/main
git checkout -b feat/next-feature
```

> Local `main` does NOT auto-update after a PR is merged on GitHub.  
> Branching off a stale `main` → conflicts in the next PR.

### If a branch is stale (conflicts with main)

```bash
git fetch origin
git checkout main && git reset --hard origin/main
git checkout your-branch
git rebase origin/main      # on conflicts: git rebase --continue
git push origin your-branch --force-with-lease
```

---

## CI/CD Pipeline

### PR check (`.github/workflows/pr-check.yml`)

Runs automatically on every PR to `main`:

1. `build` → `build:server` → `lint` → `format:check`
2. If all pass **and** author is `bk201-` → **auto-squash-merge** + branch deletion

Required status check name in Ruleset: **`Build & Lint`**

> Auto-merge uses `PAT_TOKEN` (not `GITHUB_TOKEN`) — otherwise GitHub won't trigger downstream workflows.

### Main pipeline (`.github/workflows/build-main.yml`)

Runs on every push to `main` (i.e. after PR merge):

1. Quality gate (same 4 checks)
2. `docker build` → push to ACR
3. `az containerapp update` → deploy
4. Smoke test: `GET /api/health` every 10 sec for up to 3 min
5. `docker save` → artifact `docker-image-<sha>.tar.gz` (3 most recent kept)
6. On `failure()` → Telegram notification via `ALERT_BOT_TOKEN`

---

## Branch naming

```
feat/short-description    # new feature
fix/short-description     # bug fix
chore/short-description   # tech debt, refactoring, dependency updates
docs/short-description    # documentation only
```

---

## Commit message format

```
feat: add channel sorting
fix: badge count after mark-all-read
chore: update dependencies
docs: update ROADMAP
refactor: split AppHeader into components
```

---

## Language convention

**All code comments and `.md` files (except `ROADMAP.md`) must be written in English.**

- `ROADMAP.md` is the planning document and may remain in Russian
- All other `.md` files: `AGENTS.md`, `CONTRIBUTING.md`, `docs/*.md` — English only
- TypeScript/JS comments: English only
- Git commit messages: English only
