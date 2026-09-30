# TG News Reader

Apply the root `AGENTS.md` first. This workspace owns the Telegram reader domain; shared packages provide mechanics, not news policies.

## Domain invariants

- Keep GramJS sessions server-side. Telegram requests use the existing circuit breaker, retries and download queue; preserve FloodWait handling and bounded concurrency.
- Preserve the distinction between `lastFetchedAt` (stored/fetch boundary) and `lastReadAt` (read position). Read-state changes must reconcile feed caches and channel badges without counting a post twice.
- PIN-protected group access depends on persisted session unlock state. Client visibility alone is not authorization; check access before serving media, streams or storage metadata.
- Downloads and media remain app-local. Respect storage-reserve pauses, partial-file cleanup, Range requests and progress events; avoid buffering large media.
- Keep news schemas, migrations, channel strategies, filters, download workers, service worker behavior and domain stores here.

## Changing behavior

- Start with the existing route/service tests in `src/server/__tests__/` and nearby client tests. Add regression coverage for changed read-state, authorization, media and queue behavior.
- Use TanStack Query for server state and the existing Zustand stores for UI/auth state. Preserve cache invalidation and optimistic rollback behavior.
- Follow existing `antd-style`/`createStyles` patterns and update both English and Russian UI resources.
- For changes to groups, media, read-state, downloads or digest behavior, read the relevant section of [architecture notes](docs/architecture.md). For rationale, consult [decisions](docs/decisions.md); for proposed features, consult [ROADMAP](ROADMAP.md). Historical deployment sections are inactive.
- Run app scripts from the repository root with `--workspace tg-news-reader`; see [CONTRIBUTING](CONTRIBUTING.md) for local checks.
