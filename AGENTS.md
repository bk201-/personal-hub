# personal-hub

Private, local-only npm workspace repository. Leave work available for local review; do not stage, commit, publish, push, open remote issues/PRs, or deploy automatically. Preserve app names and versions unless explicitly asked to change them. Treat `docs/archive/` as inactive historical material, not operational instructions.

## Boundaries

- `apps/tg-news-reader` owns Telegram, news, media, groups and their authorization.
- `apps/czech-learning` owns vocabulary, imports and learning behavior.
- `packages/browser` and `packages/auth-server` contain reusable mechanics. Apps depend on packages; shared runtime source never imports apps. Cross-app contract tests may exercise the real app adapters. Domain models, routes, schemas and policies stay in their app.
- Each app owns its database, migrations, users, sessions, secrets and auth configuration. Sharing implementation does not create shared identity or storage.
- Read the app's `AGENTS.md` before changing its domain. Read the root `README.md` for workspace commands and local ports.

## Working locally

- Install with `npm ci` at the root only; use workspace-scoped scripts for focused changes. TypeScript 6, Vite 8, Oxlint and Oxfmt are the shared tooling baseline.
- Validate the affected workspaces and shared-package consumers with existing scripts. Report checks actually run and remaining failures; a build is not a substitute for tests.
- Keep credentials, `.env` contents, tokens and application data out of patches, logs and prompts. Use disposable test data rather than live databases.
- Keep new documentation and code comments in English; preserve the original language and unchecked status of historical plans. A plan is not evidence that a feature exists.
