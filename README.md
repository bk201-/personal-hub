# personal-hub

Public GitHub monorepo for three independent personal applications. The npm workspaces remain private to prevent package publication. App package names and versions are retained from their source repositories.

| Workspace                | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| `apps/tg-news-reader`    | Telegram news, articles and media        |
| `apps/czech-learning`    | Czech vocabulary and learning            |
| `apps/dmitriishilov.com` | Static Astro CV and personal links       |
| `packages/browser`       | Reusable browser mechanics               |
| `packages/auth-server`   | Reusable server authentication mechanics |

The two React apps consume the shared packages, not each other. The Astro CV site remains independent, with no React shell or shared authentication. Domain schemas, routes, policies and UI remain in the apps. Databases, migrations, credentials, users and sessions remain independent; this is not single sign-on.

## Local development

Use Node.js 24.15 or newer. Run commands from this directory. Install once using the root lockfile:

```sh
npm ci
npm run dev:news
# In another terminal:
npm run dev:czech
# Or the independent CV site:
npm run dev:cv
```

| App        | Client                | API                   | Vite preview                  |
| ---------- | --------------------- | --------------------- | ----------------------------- |
| News       | http://localhost:5173 | http://localhost:3173 | http://localhost:4173         |
| Czech      | http://localhost:5174 | http://localhost:3174 | http://localhost:4174         |
| CV (Astro) | http://127.0.0.1:4321 | None                  | http://127.0.0.1:4321 (Astro) |

Each app manages its own local environment and `data/` directory. Supply local configuration separately for each app; credentials and populated databases are intentionally not migrated. Cookies are not isolated by port: news uses `tg_news_reader_refresh_token` and `tg_news_reader_media_token`, while Czech uses `czech_learning_refresh_token`. Legacy cookies are not reused; sign in separately. Preview serves a built client; it does not start the API.

Database initialization and account creation are explicit, app-scoped operations:

```sh
npm run db:migrate --workspace tg-news-reader
npm run db:migrate --workspace czech-learning
npm run auth:create-user --workspace tg-news-reader
npm run auth:create-user --workspace czech-learning
```

See the scripts themselves for required arguments. News Telegram authentication is separate from application login:

```sh
npm run tg:auth --workspace tg-news-reader
```

Run authentication only when deliberately configuring your own local account; it contacts Telegram and writes local credentials. Normal validation does not require running it.

## Checks

React apps and shared packages use TypeScript 7. The root and CV workspace retain TypeScript 6 because `@astrojs/check` and its hoisted Volar dependencies require the JavaScript compiler API that TypeScript 7 no longer provides. A CV-local dependency alone does not constrain Volar's compiler resolution. Vitest and its coverage provider use version 5 across their consumers. Oxlint and Oxfmt are shared; React apps use Vite 8 while the CV workspace retains Astro and its compatible Vite. Root build/typecheck include the CV site; server builds and tests remain scoped to workspaces that provide them. Oxfmt handles supported non-Astro files; the CV workspace retains explicit `format:astro` / `format:astro:check` scripts using its existing Prettier Astro plugin, outside the root formatting check.

```sh
npm run build
npm run build:server
npm run typecheck
npm run test
npm run test:ci
npm run lint
npm run format:check
```

For focused changes, target the app (and affected shared-package consumers):

```sh
npm run test --workspace tg-news-reader
npm run typecheck --workspace czech-learning
npm run lint --workspace tg-news-reader
npm run format:check --workspace czech-learning
```

Use `package.json` scripts as the authoritative command list. Install dependencies only at the root; workspace commands run with that workspace as their working directory. Before invoking a React app script directly after a clean checkout, run `npm run build:shared`. Rebuild shared packages after editing them; React root dev/build/test commands do this on entry. The CV site needs no shared build.

After changing dependency ranges, update the root lockfile with `npm install` before using `npm ci`. Upgrade peer-coupled packages together (notably `vitest` and `@vitest/coverage-v8`), including shared-package consumers. If npm retains an incompatible older peer from the lockfile, use a targeted `npm update` for the related packages and inspect `npm ls --all`; do not bypass peer checks with `--force` or `--legacy-peer-deps`.

## GitHub automation

GitHub discovers workflows only in root `.github/workflows`, not inside `apps/`. CI separates the runnable apps and shared packages while using the root lockfile and shared tooling. `music-discovery` is still plans-only.

- `ci.yml` validates PRs, `main` pushes and manual runs without production secrets. It covers workspace typechecks, builds and tests, repository lint/format, and news/Czech Docker builds using each app's Dockerfile with the root build context. `Build & Lint` is the stable aggregate result. The full Astro template formatting check remains outside CI because 38 imported templates already fail it; run it when changing those templates and keep baseline cleanup separate.
- `auto-merge.yml` is separate from untrusted PR builds. Owner PR automation is opt-in through `AUTO_MERGE_OWNER_PRS=true`; native GitHub auto-merge is already allowed, but neither option substitutes for required CI. The workflow only squash-merges the current, successful, same-repository owner PR head. Workflow/automation-helper changes require a manual merge. It uses `GITHUB_TOKEN`, not the legacy PAT, and explicitly dispatches CI on `main` after merging because token-created pushes do not trigger normal push workflows.
- `deploy-tg-news-reader.yml` belongs only to news. `TG_NEWS_READER_DEPLOY_ENABLED` must explicitly equal `true` before production jobs can run. Czech and CV do not inherit news's Azure resources or credentials.

**Rollout:** `Protect main` now requires the GitHub Actions `Build & Lint` result and an up-to-date branch, alongside no-bypass PR/force-push/deletion protection. The workflow migration was merged through PR #2 and CI passed on `main`. Owner automation remains disabled; its explicit downstream CI dispatch and the separate production gate should remain part of rollout review.

**Production cutover is separate.** The old `bk201-/tg-news-reader` deployment remains the current source until explicitly switched. Disable its `Build Main` workflow and wait for all in-flight deployments to finish before activating the monorepo deploy gate. The new workflow fails closed if it cannot confirm that state. Approve the downtime explicitly with `TG_NEWS_READER_CUTOVER_MODE=stop-before-start`: the workflow stops and drains old replicas before starting the new revision, rather than allowing rolling overlap of Telegram clients.

Before activation, protect the `tg-news-reader-production` environment with required reviewers and a main-only branch policy. The existing news app must use port 3173, exactly one container, `minReplicas=maxReplicas=1`, its image-default command and existing persistent storage mounted at `/app/data`. The legacy news runtime paths are preserved; the monorepo move does not require relocating its persisted data. The workflow refuses incompatible infrastructure; it does not create storage, migrate data or change Telegram sessions. Keep previous images/revisions for operator recovery. On a failed cutover it deliberately does not restart the old revision automatically, which could overlap a still-running new client.

The deployment only consumes successful CI for the current `main` SHA. Changed paths are compared with the last successful deployment recorded for `tg-news-reader-production`, so unrelated app merges cannot lose an earlier pending news change. The first deployment considers the complete tree. A manual dispatch with `force_news_deploy=true` can redeploy an unchanged, verified SHA for recovery. Image archives contain no runtime data and are publicly downloadable artifacts in this repository.

The twelve legacy Actions secrets were copied to `personal-hub` without changing their values or token permissions. Their presence is not authorization to use them in PR builds, and it does not prove the old PAT can administer the new repository. Deployment activation, secret rotation and infrastructure changes require explicit authorization.

Secret scanning and push protection are enabled on the public repository. Keep production credentials in GitHub secrets or app-local configuration, never in workflow files, fixtures or CI logs.

## Independent production artifacts

From the root, build each image with the root directory as its context:

```powershell
docker build -f apps\tg-news-reader\Dockerfile -t personal-hub-news:local .
docker build -f apps\czech-learning\Dockerfile -t personal-hub-czech:local .
```

Each Dockerfile stays with its app, but `COPY` paths are relative to the repository-root build context, not the Dockerfile's directory. Both stages copy only the target app's manifest and required shared-package manifests, using the unchanged root lockfile. The builder explicitly copies the target app's build inputs, shared sources and common build scripts; no unrelated app sources or manifests are copied. Builder installs include the selected shared workspaces and root compiler tooling, not every workspace.

These are separate images, not a combined server. News preserves its standalone runtime contract: working directory `/app`, app metadata at `/app/package.json`, entry point `/app/dist/server/index.js`, persistent volume `/app/data`, and port 3173. `/app/dist` links to the built app inside the installed workspace tree, preserving Node's resolution of shared packages and any app-local dependencies. Czech remains at `/app/apps/czech-learning` with data under that directory and port 3174. Internal ports do not need to be unique across isolated containers; use distinct host port mappings when running them locally. Supply independent credentials and volumes. The root `.dockerignore` excludes secrets, local data and build output; runtime installation uses `npm ci --omit=dev` scoped to its app.

Each Vite build writes `dist/build-id.json` and embeds the same per-app identity in the client. Keep that file with its client/server artifacts. `/api/version` reports it with `Cache-Control: no-store`; a same-version rebuild produces a different identity. `APP_BUILD_ID` can provide an explicit build identity, but must agree between build and runtime. Update banners reload only after user action.

Initial migration verification used separate production-only dependency layouts, Czech HTTP/static/auth/vocabulary smoke tests and news in-process auth/version tests, without Telegram credentials. On October 2, both actual Dockerfiles also built successfully with the root context. Disposable, network-isolated runtime smoke checks exercised the resulting images; no production configuration or Telegram session was supplied. These checks do not establish production readiness or live Telegram behavior.

The scoped Dockerfile inputs were also exercised in clean local fixtures: builder and production installs, dependency graphs, shared/app/server builds, production imports and in-memory SQLite smoke tests passed without unrelated app workspaces.

## Documentation and plans

**Continue from the repository:** read [the continuation plan](plans/platform/continuation.yaml)
for decisions, application status and remaining work from the original discussion.
It is linked from `AGENTS.md`; a new repository-local agent session does not need Scout
or the old chat. The Czech app is an OCR-focused early prototype whose redesign is
still open, not the primary acceptance target for the migration.

`apps/music-discovery` reserves a future VK-to-Spotify discovery app. It has no
runtime or npm workspace yet. Its [draft PRD](plans/music-discovery/prd.yaml) and
[implementation slices](plans/music-discovery/implementation.yaml) distinguish
confirmed requirements from proposed behavior and unresolved provider access.

- [Shared agent rules](AGENTS.md), [news domain guidance](apps/tg-news-reader/AGENTS.md), [Czech domain guidance](apps/czech-learning/AGENTS.md).
- [News README](apps/tg-news-reader/README.md), [contribution checks](apps/tg-news-reader/CONTRIBUTING.md), [architecture notes](apps/tg-news-reader/docs/architecture.md), [roadmap](apps/tg-news-reader/ROADMAP.md).
- [Czech historical plan](plans/czech-learning/czech-learning-app.md): moved from the Czech repository's `plans/`; original intent and unchecked acceptance criteria are retained. It is not an implementation-status report.
- [CV README](apps/dmitriishilov.com/README.md), [CV PRD](plans/dmitriishilov.com/prd-cv-site.md) and [historical implementation plan](plans/dmitriishilov.com/cv-site.md). The PRD was found in news documentation and consolidated under the CV plans; no duplicate remains in the news app. Supporting PDF/photo stay with the relocated plan.
- News had no populated plan files to migrate; its existing roadmap remains in the app.

## Local skills and provenance

Active project skills live only in root `.agents/skills/`:

- `local-plan` consolidates the Czech repository's `write-a-prd`, `prd-to-plan` and `prd-to-issues` into local requirements, vertical slices and reviewable work items. Their original lock recorded `mattpocock/skills`; these are locally adapted instructions, not unchanged upstream installations.
- `local-review` provides read-only change review and local validation.
- `create-pr` adapts the restored news publication skill to explicit authorization, protected `main`, workspace-aware checks and unchanged app versions.
- Czech `grill-me` duplicated the globally available interview capability and was removed locally. Global skills were not changed; the local planning workflow is self-contained and does not require them.

`skills-lock.json` deliberately contains no remote skill entries: the active skills are maintained in this repository, so retaining their old remote hashes would falsely describe their provenance.

The CV import preserves the current unpublished worktree of `C:\Users\dshilov\WebstormProjects\dmitriishilov.com` (HEAD `fb3abfaf`, 10 commits), including its existing public PDF. Source files and index remain untouched. Its original history is retained under local `refs/archive/dmitriishilov.com/`, without altering monorepo ancestry or adding remotes. Verified source bundle, worktree/index snapshots and SHA256 provenance are stored in sibling `personal-hub-backup-20260930/cv-import/`.

## Inactive deployment history

The former news deployment and auto-merge workflows are preserved unchanged under `docs/archive/tg-news-reader/.github/workflows/`, outside GitHub's root workflow discovery path. Their monorepo replacements live in root `.github/workflows` with the rollout gates described above. Deployment-only helper scripts are archived alongside in `scripts/`; `tg:auth:deploy` is no longer an active package command. [Setup history](docs/archive/tg-news-reader/.github/SETUP.md) and [Azure operations history](docs/archive/tg-news-reader/azure.md) explain the former standalone deployment only; archived commands and resource identifiers are not setup instructions for personal-hub.

The CV site's original deployment workflow is likewise preserved byte-for-byte under `docs/archive/dmitriishilov.com/.github/workflows/` and remains inactive. The CV import does not publish, push or deploy the site.
