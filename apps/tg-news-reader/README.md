# TG News Reader

Personal full-stack Telegram reader: fetch channel posts, store articles and media locally, and browse them in a React UI. This is the `tg-news-reader` workspace in [personal-hub](../../README.md), not a standalone installation.

## Stack and layout

- Hono on Node.js, Drizzle and libSQL/SQLite, GramJS.
- React 19, Ant Design 6, TanStack Query and Zustand.
- TypeScript 7, Vite 8, Oxlint, Oxfmt and Vitest.
- `src/server/`: domain routes, database, Telegram services and download workers.
- `src/client/`: reader UI, query hooks and domain stores.
- `src/shared/`: app-specific types; `public/sw.js`: media service worker.
- `scripts/`: local account, Telegram authentication and maintenance utilities.
- Shared mechanics come from root `packages/browser` and `packages/auth-server`; news state and authorization policy remain here.

## Local commands

From the **repository root**:

```sh
npm ci
npm run db:migrate --workspace tg-news-reader
npm run auth:create-user --workspace tg-news-reader
npm run tg:auth --workspace tg-news-reader
npm run dev:news
```

Configure this app's local credentials separately before initialization; account/authentication scripts require deliberate user input or arguments. Telegram authentication contacts Telegram and writes local credentials. Do not reuse the Czech database or auth configuration.

Client: `http://localhost:5173`; API: `http://localhost:3173`; Vite preview: `http://localhost:4173`. Preview requires a separate running API. Installation and lockfile management belong to the repository root.

## Documentation

- [AGENTS](AGENTS.md): domain invariants and change guidance.
- [CONTRIBUTING](CONTRIBUTING.md): local validation.
- [Architecture](docs/architecture.md): detailed feature notes.
- [Decisions](docs/decisions.md): rationale and historical fixes.
- [ROADMAP](ROADMAP.md): proposals, not shipped-feature claims.
- [GitHub automation](../../README.md#github-automation): monorepo CI, protected-main rollout and gated news deployment.
- [Archived Azure operations](../../docs/archive/tg-news-reader/azure.md): inactive standalone deployment history.
