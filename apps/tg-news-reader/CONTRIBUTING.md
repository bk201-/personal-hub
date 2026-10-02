# Local contribution checks

This app belongs to the public [personal-hub monorepo](../../README.md). Work remains local for review unless publication is authorized; version bumps and production deployment are separate decisions.

## Validation

Run from the repository root after the root `npm ci`:

```sh
npm run build:shared
npm run build --workspace tg-news-reader
npm run build:server --workspace tg-news-reader
npm run typecheck --workspace tg-news-reader
npm test -- --workspace tg-news-reader
npm run lint --workspace tg-news-reader
npm run format:check --workspace tg-news-reader
```

Lint uses Oxlint; formatting uses Oxfmt. Use targeted tests while iterating, then validate affected consumers when shared packages change. Report actual outcomes, including unavailable checks and pre-existing failures. Review formatting changes before accepting them.

Add tests for changed domain behavior using the existing Vitest patterns. For regressions, reproduce the failure before fixing it. Database/route tests should use disposable fixtures rather than a user's database.

## Review and documentation

Use the root `local-review` skill for a read-only review and validation summary. Keep unrelated changes intact. Preserve app package names and versions unless a version change is explicitly requested.

Document changed behavior in the relevant architecture section, not as extra always-loaded agent instructions. Write new documentation and comments in English; retain historical source-language plans.

Current CI and deployment rollout rules live in the [root README](../../README.md#github-automation). Former standalone GitHub instructions remain [archived](../../docs/archive/tg-news-reader/.github/SETUP.md); do not use them to configure monorepo permissions or deployment.
