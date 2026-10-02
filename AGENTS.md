# personal-hub

Public GitHub repository with private npm workspaces. Leave changes available for local review unless the user authorizes committing or publishing them. Published changes go through a `dev/dshilov/*` branch and a PR to protected `main`. Production deployment and cutover require separate authorization. Preserve app names and versions unless explicitly asked to change them. Treat `docs/archive/` as inactive historical material, not operational instructions.

## Continuing work

When resuming the project, choosing next work, or revisiting migration/product decisions, read `plans/platform/continuation.yaml`. It records the chat handoff, intentional pending changes, product maturity and remaining milestones without requiring Scout. Inspect current Git state before treating its dated snapshot as current.

## Boundaries

- `apps/tg-news-reader` owns Telegram, news, media, groups and their authorization.
- `apps/czech-learning` owns vocabulary, imports and learning behavior.
- `apps/dmitriishilov.com` owns the static Astro CV site and its content; it stays independent of the React shell and shared authentication.
- `apps/music-discovery` is a plans-only placeholder. For its scope and unresolved provider access, read `plans/music-discovery/prd.yaml` and `implementation.yaml` in the same directory before adding runtime code.
- `packages/browser` and `packages/auth-server` contain reusable mechanics. Apps depend on packages; shared runtime source never imports apps. Cross-app contract tests may exercise the real app adapters. Domain models, routes, schemas and policies stay in their app.
- Each app owns its database, migrations, users, sessions, secrets and auth configuration. Sharing implementation does not create shared identity or storage.
- Read the app's `AGENTS.md` before changing its domain. Read the root `README.md` for workspace commands and local ports.

## Working locally

- Install with `npm ci` at the root only; use workspace-scoped scripts for focused changes. React apps and shared packages use TypeScript 7; root/CV retain TypeScript 6 for Astro's compiler API compatibility. Use the CV workspace's `format:astro` script for `.astro` templates, which Oxfmt does not format.
- Validate the affected workspaces and shared-package consumers with existing scripts. Report checks actually run and remaining failures; a build is not a substitute for tests.
- Keep credentials, `.env` contents, tokens and application data out of patches, logs and prompts. Use disposable test data rather than live databases.
- Keep new documentation and code comments in English; preserve the original language and unchecked status of historical plans. A plan is not evidence that a feature exists.

## GitHub automation

- Workflows live in root `.github/workflows`; app-specific build and deployment inputs stay with their app. Read the root README's GitHub automation section before changing triggers, merge gates or deployment.
- Keep PR validation independent of production secrets. A shared-package change must validate its consumers. Preserve the stable aggregate check name `Build & Lint`.
- News production activation requires disabling and draining the old repository's deployment first. Czech and CV do not inherit news infrastructure, credentials or deployment policies.
