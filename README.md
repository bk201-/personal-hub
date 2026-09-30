# personal-hub

Private, local-only npm workspaces for two independent personal applications. App package names and versions are retained from their source repositories.

| Workspace              | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `apps/tg-news-reader`  | Telegram news, articles and media        |
| `apps/czech-learning`  | Czech vocabulary and learning            |
| `packages/browser`     | Reusable browser mechanics               |
| `packages/auth-server` | Reusable server authentication mechanics |

Apps consume the shared packages, not each other. Domain schemas, routes, policies and UI remain in the apps. Databases, migrations, credentials, users and sessions remain independent; this is not single sign-on.

## Local development

Use Node.js 24.15 or newer. Run commands from this directory. Install once using the root lockfile:

```sh
npm ci
npm run dev:news
# In another terminal:
npm run dev:czech
```

| App   | Client                | API                   | Vite preview          |
| ----- | --------------------- | --------------------- | --------------------- |
| News  | http://localhost:5173 | http://localhost:3173 | http://localhost:4173 |
| Czech | http://localhost:5174 | http://localhost:3174 | http://localhost:4174 |

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

The shared baseline is TypeScript 6, Vite 8, Oxlint and Oxfmt. Root commands run the corresponding workspace checks:

```sh
npm run build
npm run build:server
npm run typecheck
npm run test
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

Use `package.json` scripts as the authoritative command list. Install dependencies only at the root; workspace commands run with that workspace as their working directory. Before invoking an app script directly after a clean checkout, run `npm run build:shared`. Rebuild shared packages after editing them; root dev/build/test commands do this on entry.

## Independent production artifacts

From the root, build each image with the root directory as its context:

```powershell
docker build -f apps\tg-news-reader\Dockerfile -t personal-hub-news:local .
docker build -f apps\czech-learning\Dockerfile -t personal-hub-czech:local .
```

These are separate images, not a combined server. Runtime working/data directories are `/app/apps/tg-news-reader` and `/app/apps/czech-learning`; expose ports 3173 and 3174 respectively. Supply independent credentials and volumes. The root `.dockerignore` excludes secrets, local data and build output; runtime installation uses `npm ci --omit=dev` scoped to its app.

Each Vite build writes `dist/build-id.json` and embeds the same per-app identity in the client. Keep that file with its client/server artifacts. `/api/version` reports it with `Cache-Control: no-store`; a same-version rebuild produces a different identity. `APP_BUILD_ID` can provide an explicit build identity, but must agree between build and runtime. Update banners reload only after user action.

Migration verification used separate production-only dependency layouts, Czech HTTP/static/auth/vocabulary smoke tests and news in-process auth/version tests, without Telegram credentials. Docker itself was available, but its Node base image was not cached; no image pull/build was performed under the local-only/no-registry constraint. Linux image execution and live Telegram remain unverified.

## Documentation and plans

- [Shared agent rules](AGENTS.md), [news domain guidance](apps/tg-news-reader/AGENTS.md), [Czech domain guidance](apps/czech-learning/AGENTS.md).
- [News README](apps/tg-news-reader/README.md), [contribution checks](apps/tg-news-reader/CONTRIBUTING.md), [architecture notes](apps/tg-news-reader/docs/architecture.md), [roadmap](apps/tg-news-reader/ROADMAP.md).
- [Czech historical plan](plans/czech-learning/czech-learning-app.md): moved from the Czech repository's `plans/`; original intent and unchecked acceptance criteria are retained. It is not an implementation-status report.
- News had no populated plan files to migrate; its existing roadmap remains in the app.

## Local skills and provenance

Active project skills live only in root `.agents/skills/`:

- `local-plan` consolidates the Czech repository's `write-a-prd`, `prd-to-plan` and `prd-to-issues` into local requirements, vertical slices and reviewable work items. Their original lock recorded `mattpocock/skills`; these are locally adapted instructions, not unchanged upstream installations.
- `local-review` replaces news `create-pr` with read-only change review and local validation. It does not bump versions or perform Git/remote writes.
- Czech `grill-me` duplicated the globally available interview capability and was removed locally. Global skills were not changed; the local planning workflow is self-contained and does not require them.

`skills-lock.json` deliberately contains no remote skill entries: the active skills are maintained in this repository, so retaining their old remote hashes would falsely describe their provenance.

## Inactive deployment history

The former news deployment and auto-merge workflows are preserved unchanged under `docs/archive/tg-news-reader/.github/workflows/`, outside GitHub's root workflow discovery path. Deployment-only helper scripts are archived alongside in `scripts/`; `tg:auth:deploy` is no longer an active package command. [Setup history](docs/archive/tg-news-reader/.github/SETUP.md) and [Azure operations history](docs/archive/tg-news-reader/azure.md) explain the former standalone deployment only. No active deployment or publishing workflow is enabled by this migration; archived commands and resource identifiers are not setup instructions for personal-hub.
