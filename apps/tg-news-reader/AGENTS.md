# TG News Reader — AI Agent Instructions

## Project Overview

Full-stack personal Telegram news reader. **Backend**: Hono (Node.js) + SQLite/Turso via `@libsql/client` + Drizzle ORM. **Frontend**: React 19 + Ant Design 6 + TanStack Query v5 + Zustand. Server runs on port `3173`, Vite dev server on `5173`.

## Key Commands

```bash
npm run dev               # Start both server + client (concurrently)
npm run db:migrate        # Apply DB migrations (always run after schema changes)
npm run tg:auth           # Authenticate Telegram session (writes TG_SESSION to .env)
npm run auth:create-user  # Create a new app user account (interactive, writes to DB)
npm run lint              # ESLint check
npm run build             # Vite build + tsc
```

## Before Every Push

Run all four checks — push only if all pass:

```bash
npm run build          # Vite client build
npm run build:server   # tsc -p tsconfig.server.json (server type check)
npm run lint           # ESLint
npm run format:check   # Prettier (read-only check, use format to fix)
```

## Testing Requirements

**Every PR must include tests for the changes it introduces.** This applies to both new features and bug fixes.

### New feature

- Add unit/integration tests covering the core logic of the feature.
- If the feature adds a new route — add integration tests (`*.integration.test.ts`) using the in-memory DB pattern (see `src/server/__tests__/`).
- If the feature adds a new store action or pure utility — add unit tests.

### Bug fix

- **First**, write a failing test that reproduces the bug (red).
- **Then**, fix the bug and confirm the test passes (green).
- Check coverage: run `npx vitest run --coverage` and verify the fixed code path is covered. If the bug was in a previously uncovered area, the new test must cover it.

### Coverage policy

- Thresholds: **70% stmts / 60% branches / 60% functions / 75% lines** (enforced in `vitest.config.ts`).
- After adding tests, run `npx vitest run --coverage` to verify — the report shows per-file stats.
- Prioritize testing **business logic** (services, routes, stores, pure utils) over UI components.

## Versioning

Version is in `package.json` and displayed in the app's user menu. Bump it **in the same PR** that introduces the change:

| Change                                  | Version part                | Example                            |
| --------------------------------------- | --------------------------- | ---------------------------------- |
| Bug fix only                            | **patch** (`1.1.0 → 1.1.1`) | fix scroll, fix video autoplay     |
| New feature (with or without bug fixes) | **minor** (`1.1.0 → 1.2.0`) | new digest button, version display |
| Breaking / major rework                 | **major** — discuss first   | n/a                                |

Rules:

- If a PR contains **both** a fix and a feature → bump **minor** only.
- Never bump major without explicit discussion.
- Use `npm version patch` / `npm version minor` (updates `package.json` and creates a git tag), or edit `package.json` directly.

## Git Workflow & CI/CD

**`main` is protected** — direct pushes are blocked by a GitHub Ruleset. All changes must go through a PR.

### Creating a PR

```bash
git checkout -b feat/my-feature   # branch off main
# make changes
git add . && git commit -m "feat: description"
git push origin feat/my-feature
# GitHub will print a URL to open the PR, or use: gh pr create --base main
```

> ⚠️ **После каждого `git push` — немедленно переключись на `main` и обнови его.**  
> Это обязательный шаг после каждого пуша фича-ветки, не только после мержа.  
> Локальный `main` не обновляется автоматически после мержа PR на GitHub.  
> Если создать новую ветку от устаревшего `main` — при следующем PR будут конфликты.

```bash
# После каждого git push — ВСЕГДА делай это сразу:
git checkout main
git pull origin main          # или: git reset --hard origin/main
# теперь можно создавать следующую ветку:
git checkout -b feat/next-feature
```

### PR pipeline (`.github/workflows/pr-check.yml`)

Runs automatically on every PR to `main`:

1. `npm run build` → `npm run build:server` → `npm run lint` → `npm run format:check`
2. If all pass **and** PR author is `bk201-` → PR is **auto-squash-merged** and the branch is deleted

Required status check name in the Ruleset: **`Build & Lint`**

> ⚠️ **Auto-merge uses `PAT_TOKEN`, not `GITHUB_TOKEN`.**  
> GitHub intentionally ignores workflow triggers from pushes made by `GITHUB_TOKEN` (to prevent infinite loops).  
> The auto-merge step in `pr-check.yml` must use a PAT stored as `secrets.PAT_TOKEN`  
> (fine-grained, `Contents: write` + `Pull requests: write` on this repo).  
> Without this, `build-main.yml` will never fire automatically after a PR merge.

### Main pipeline (`.github/workflows/build-main.yml`)

Runs on every push to `main` (i.e., after PR merge):

1. Same quality gate (fails the build if checks fail)
2. `docker login ACR` → `docker build` → `docker push` to ACR
3. `az login` (service principal via `AZURE_CREDENTIALS`) → `az containerapp registry set` → `az containerapp update` (deploy new image) → set single-revision mode
4. **Smoke test**: polls `https://<fqdn>/api/health` every 10s for up to 3 min — fails workflow if container never becomes healthy
5. `docker save | gzip` → uploaded as artifact `docker-image-<sha>.tar.gz`
6. Cleanup step keeps only the **3 most recent** artifacts
7. **`Notify failure (Telegram)`** step: `if: failure()` — sends deploy-failed alert via Bot API; no-op if `ALERT_BOT_TOKEN`/`ALERT_CHAT_ID` secrets not set

**Required secrets**: `ACR_LOGIN_SERVER`, `ACR_USERNAME`, `ACR_PASSWORD`, `AZURE_CREDENTIALS`, `AZURE_RESOURCE_GROUP`, `AZURE_CONTAINER_APP`, `PAT_TOKEN`  
**Optional secrets** (for Telegram deploy alerts): `ALERT_BOT_TOKEN`, `ALERT_CHAT_ID`

### Rebasing a stale branch

If a branch was created before recent PRs merged to `main`, GitHub will report conflicts. Fix:

```bash
git fetch origin
git checkout main && git reset --hard origin/main
git checkout your-branch
git rebase origin/main   # resolve conflicts, then: git rebase --continue
git push origin your-branch --force-with-lease
```

### Setup checklist

One-time GitHub settings required after cloning/forking — see `.github/SETUP.md`.

## Architecture

```
src/
  server/
    config.ts         # Centralised env/config constants (JWT, download limits, media sizes, news fetch)
    index.ts          # Hono app, registers all routers + calls startWorkerPool(DOWNLOAD_WORKER_CONCURRENCY)
    db/
      schema.ts       # Drizzle schema (source of truth for types)
      migrate.ts      # Manual migration runner (CREATE TABLE IF NOT EXISTS + ALTER TABLE)
      index.ts        # libsql client + drizzle instance; reads DATABASE_URL+TURSO_AUTH_TOKEN for Turso when set, falls back to file:data/db.sqlite locally
    middleware/       # auth.ts (JWT verify), cors.ts, rateLimit.ts (production only, 120 req/min)
    routes/           # channels.ts, news.ts, filters.ts, groups.ts, media.ts, content.ts, downloads.ts, auth.ts, digest.ts
                      # channels.ts: PATCH /reorder bulk-updates sort_order; groups.ts: PATCH /reorder same
    services/         # telegram.ts (gramjs), readability.ts, channelStrategies.ts,
                      # downloadManager.ts, downloadProgress.ts, mediaProgress.ts
                      # telegramCircuitBreaker.ts (retry + circuit breaker for all Telegram calls)
                      # alertBot.ts (Telegram push alerts via Bot API; no-op when env vars absent)
                      # openaiClient.ts (Azure OpenAI / OpenAI client factory + isAiConfigured())
    logger.ts         # Single pino instance — import { logger } from '../logger.js'
  client/
    components/       # Auth/ (AuthGate, LoginPage), Channels/, News/, Filters/, Layout/
                      # Channels/: ChannelSidebar, ChannelItem, ChannelFormModal, ChannelFetchModal,
                      #            SortModal (drag-and-drop on desktop, ↑↓ buttons on mobile < 768px),
                      #            GroupPanel (coordinator), GroupItem, GroupFormModal, GroupPinModal
                      # Layout/:   AppLayout (shell + URL sync), AppHeader (header + user menu + lang switcher),
                      #            TotpSetupModal (2FA flow), DownloadsPanel (badge + Drawer + SSE),
                      #            DownloadsPinnedContent (inline sidebar), DownloadTaskList (shared task list)
                      # News/:     NewsFeed (coordinator), NewsFeedToolbar, NewsFeedList, NewsAccordionList,
                      #            NewsAccordionItem, NewsListItem, NewsDetail (state+hotkeys),
                      #            NewsDetailToolbar, NewsDetailBody (media+text+modal), NewsDetailMedia,
                      #            NewsDetailTopPanel, NewsTextBlock (post-text infoblock card),
                      #            NewsArticleBody (Markdown/plain-text article renderer);
                      #            hooks: useHashTagSync, useMobileBreakpoint, useNewsHotkeys
    api/              # React Query hooks + helpers: channels.ts, news.ts, groups.ts, filters.ts, downloads.ts,
                      # mediaProgress.ts, mediaUrl.ts; central fetch client: client.ts
                      # channels.ts: useReorderChannels(); groups.ts: useReorderGroups()
    services/
      serviceWorker.ts  # SW registration (prod-only) + messaging helpers (getSwStats, clearSwCache)
    store/
      uiStore.ts      # Zustand UI store (selectedChannelId, selectedGroupId, selectedNewsId, theme, etc.)
      authStore.ts    # Zustand auth store (accessToken, user, unlockedGroupIds, isCheckingAuth)
    i18n.ts           # i18next init: EN default, RU fallback, persisted in localStorage
    locales/
      en/translation.json   # English strings (primary)
      ru/translation.json   # Russian strings (fallback)
    styles.css        # Global reset only (10 lines) — all component styles live in createStyles
  shared/types.ts     # Shared TS interfaces (Channel, Group, NewsItem, Filter, DownloadTask)
                      # NewsItem.albumMsgIds?: number[] — full album size from Telegram (set at fetch time,
                      # persists even before images are downloaded; used to guard Space key in albums)
                      # NewsItem.fullContentFormat?: 'text'|'markdown' — 'markdown' for newly extracted articles
                      # (turndown HTML→MD); 'text' for legacy plain-text rows (DB DEFAULT)
```

## DB Migration Pattern

**No Drizzle migrations folder** — uses `src/server/db/migrate.ts` directly:

1. `CREATE TABLE IF NOT EXISTS` blocks for initial schema
2. `alterMigrations` array with `ALTER TABLE` statements wrapped in try/catch (idempotent)
3. One-time data fixups after the loop
4. Always run `npm run db:migrate` after editing `schema.ts`

## Routing Convention

- All API routes mounted under `/api/` in `server/index.ts`
- Each route file exports a Hono `router` as default
- `/api/auth/*` is **public** (login/refresh/logout) — no auth middleware applied
- `/api/health` and `/api/ready` are public; all other `/api/*` routes require a valid JWT
- `channels.ts` exports `getSinceDate()` helper (used by the fetch route). `count-unread` intentionally does **not** use `getSinceDate` — it uses `lastFetchedAt` directly to avoid double-counting already-fetched unread messages.

## Auth System

JWT-based auth with httpOnly refresh-cookie rotation and optional TOTP:

- **`users` table**: `id, email, password_hash, totp_secret (null=disabled), role, created_at`
- **`sessions` table**: `id (UUID), user_id, refresh_token_hash, expires_at, unlocked_group_ids (JSON), user_agent, ip, created_at`
- **Access token**: short-lived JWT (15 min), signed HS256 — payload: `{ sub, role, sessionId, unlockedGroupIds, exp }`. Secret: `JWT_SECRET` env var (throws in production if unset).
- **Refresh token**: UUID stored as bcrypt hash in `sessions`; sent/read as httpOnly `refresh_token` cookie (`sessionId:token` format).
- **Flow**: `POST /api/auth/login` → returns `{ accessToken }` + sets cookie; `POST /api/auth/refresh` → reads cookie, issues new access token; `POST /api/auth/logout` → deletes session + clears cookie.
- **TOTP**: `GET /api/auth/totp/setup` (generate QR), `POST /api/auth/totp/confirm` (verify + save), `DELETE /api/auth/totp` (disable). Uses `otpauth` + `qrcode`.
- **Session management**: `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` (protected).
- **Client `authStore`** (`src/client/store/authStore.ts`): holds `accessToken | null`, `user`, `unlockedGroupIds: number[]` (parsed from JWT payload), `isCheckingAuth`.
- **`AuthGate`** (`src/client/components/Auth/AuthGate.tsx`): wraps the whole app; on mount calls `POST /api/auth/refresh` to restore session from cookie; shows `<LoginPage>` when unauthenticated.
- **`client.ts`** (`src/client/api/client.ts`): central `api.{get,post,patch,delete}` wrapper — automatically retries with a refreshed token on 401 (one retry only, not for `/auth` paths).
- **Create first user**: `npm run auth:create-user -- <email> <password>` (writes to DB). **For production (Turso)**: temporarily add `DATABASE_URL` + `TURSO_AUTH_TOKEN` to local `.env` before running, then remove them.

## Channel Strategy Pattern

Channel post-processing is implemented as the Strategy pattern in `src/server/services/channelStrategies.ts`:

| Strategy class             | `channelType`         | `postProcess` behaviour                                                | `requiresMediaProcessing`              |
| -------------------------- | --------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| `NoneStrategy`             | `'none'`              | no-op                                                                  | always `false`                         |
| `LinkContinuationStrategy` | `'link_continuation'` | no-op (content loaded on demand)                                       | always `false`                         |
| `MediaContentStrategy`     | `'media_content'`     | calls `enqueueTask(newsId, 'media', undefined, 0)` for each media post | `true` when any message has `rawMedia` |

Use `getChannelStrategy(channelType)` factory to get the right instance. Adding a new channel type = new class + one line in `strategyMap`. The fetch route returns `{ inserted, total, mediaProcessing }` — `mediaProcessing: true` signals the client to open the media-progress SSE.

## Download Manager

All async work (media downloads, article extraction) goes through `src/server/services/downloadManager.ts`:

- **`downloads` table**: `id, news_id (→ news ON DELETE CASCADE), type ('media'|'article'), url, priority (0=background, 10=user), status, error, created_at, processed_at` + `UNIQUE(news_id, type)`
- **`enqueueTask(newsId, type, url?, priority=0)`** — INSERT with `onConflictDoUpdate` that keeps `MAX(priority)` and resets `failed → pending`
- **`startWorkerPool(n)`** — called in `server/index.ts` with `DOWNLOAD_WORKER_CONCURRENCY` (env, default 10); resets `processing → pending` on startup (crash recovery)
- **Priority**: background=0 (media strategy auto-queue), user-initiated=10 (Download button); size limits bypassed for priority≥10
- **Auto-cleanup**: done tasks deleted after `DOWNLOAD_TASK_CLEANUP_DELAY_SEC` seconds (env, default 30)
- **SSE stream**: `GET /api/downloads/stream` — sends `init` event on connect, then `task_update` events; consumed by `useDownloadsSSE()` in `DownloadsPanel`
- **REST**: `GET/POST /api/downloads`, `PATCH /api/downloads/:id/prioritize`, `DELETE /api/downloads/:id`

Client: `src/client/api/downloads.ts` — `useDownloads()`, `useCreateDownload()`, `usePrioritizeDownload()`, `useCancelDownload()`, `useNewsDownloadTask(newsId, type)`, `useDownloadsSSE()`

`DownloadsPanel` (in `AppLayout` header) mounts `useDownloadsSSE()` once for the whole app lifetime.

## Media Progress SSE

Real-time progress for bulk media fetches (used by `media_content` channels):

- **`mediaProgressEmitter`** (`src/server/services/mediaProgress.ts`): process-wide `EventEmitter`; emits on `channel:{id}` with events `item | complete | aborted`.
- **Endpoint**: `GET /api/channels/:id/media-progress` — SSE stream; closes on `complete`/`aborted` or 5-min timeout.
- **Client hook**: `useMediaProgressSSE(channelId, key, onProgress?, onComplete?)` in `src/client/api/mediaProgress.ts` — updates `['news', channelId]` cache in-place as each item arrives; `key` forces reconnect on each fetch.

## State Management

`uiStore` (Zustand, `src/client/store/uiStore.ts`) holds:

- `selectedChannelId` / `selectedGroupId` (null = "Общее") / `selectedNewsId`
- `showAll`, `filterPanelOpen`, `hashTagFilter`
- `downloadsPanelPinned` — persisted in `localStorage`; when true, panel renders as inline sidebar
- `isDarkTheme` — persisted in `localStorage`

`authStore` (Zustand, `src/client/store/authStore.ts`) holds:

- `accessToken: string | null` — JWT access token (in-memory only)
- `user: { id, email, role, hasTOTP }` — current user
- `unlockedGroupIds: number[]` — groups whose PIN was verified (decoded from JWT, survives refresh)
- `isCheckingAuth: boolean` — true during initial session restore

## Groups System

- `groups` table: `id, name, color, pin_hash, sort_order, created_at`
- `channels.group_id` → FK to `groups.id` ON DELETE SET NULL
- `GroupPanel` (72px wide) is a coordinator component — rendering is split into:
  - `GroupItem` — single group button (icon, badge, context menu); mirrors `ChannelItem` pattern
  - `GroupFormModal` — create/edit modal; exports `PRESET_COLORS` and `GroupFormValues`
  - `GroupPinModal` — PIN unlock modal with `Input.OTP`; auto-submits on 4th digit, passes `val` directly to avoid React state batching issues
- Group badge = sum of `unreadCount` from all channels in the group
- `selectedGroupId === null` → "Общее" (channels where `group_id IS NULL`)
- PIN hashed with `bcryptjs` (saltRounds=10), verified via `POST /api/groups/:id/verify-pin`
- On successful PIN verification the server updates `sessions.unlocked_group_ids` and issues a **new access token** with the updated `unlockedGroupIds` list — unlocked groups persist across page refreshes for the duration of the session. Client receives `{ success, accessToken, unlockedGroupIds }` and calls `authStore.updateToken()`.

## Client API Pattern

Each entity has a dedicated file in `src/client/api/` using TanStack Query:

```ts
export function useThings() { return useQuery(...) }
export function useCreateThing() { return useMutation({ onSuccess: () => qc.invalidateQueries(...) }) }
```

All fetch calls go through `api` from `src/client/api/client.ts`, which attaches `Authorization: Bearer <token>` and auto-refreshes on 401.

## Component Size & Splitting Rules

**Keep components small and focused — this is non-negotiable.**

- **One component per file.** Never put multiple exported components in one file unless they are tiny private helpers (< 10 lines) used only by that file.
- **200-line hard limit.** A screen shows ~60–64 lines at a time. A 200-line component already spans 3+ screens — it's hard to read and reason about. If a component approaches or exceeds 200 lines, split it.
- **Split proactively.** If a JSX block can be meaningfully extracted — do it. Prefer more files over larger files.
- **Refactoring is always welcome.** Don't hesitate to create new files and move code around. Examples from this codebase:
  - `GroupPanel` → `GroupItem` + `GroupFormModal` + `GroupPinModal` + slim coordinator
  - `AppLayout` → `AppHeader` + `TotpSetupModal` + slim layout shell
  - `DownloadsPanel` → `DownloadTaskList` + `DownloadsPinnedContent` + slim panel
- **Coordinator pattern**: when a component has complex state + multiple visual regions, extract each region into its own component and keep the parent as a thin coordinator (state + handlers + composition only).

## CSS Conventions

**All component styles use `createStyles` from `antd-style` — no global CSS classes.**  
`styles.css` contains only a global reset (`* { box-sizing: border-box }` + `body` defaults).

### Standard pattern

```tsx
import { createStyles } from 'antd-style';

const useStyles = createStyles(({ css, token }) => ({
  item: css`
    background: ${token.colorBgContainer};
    border-bottom: 1px solid ${token.colorBorderSecondary};
    &:hover {
      background: ${token.colorFillTertiary};
    }
  `,
  itemActive: css`
    background: ${token.colorPrimaryBg};
  `,
}));

function MyComponent() {
  const { styles, cx } = useStyles();
  return <div className={cx(styles.item, isActive && styles.itemActive)} />;
}
```

- Use `token.*` for all theme-aware values (colors, borders, etc.) — **never** hardcode hex colors
- Use `cx(styles.a, condition && styles.b)` for conditional class merging
- Use `theme.useToken()` from `antd` to access tokens in component logic (e.g. inline styles)

### No inline `style={{}}` — use `createStyles` instead

**All styles must live in `createStyles`, including layout and structural styles.** The only permitted exceptions for `style={{}}` are truly runtime-dynamic values that can't be expressed as static CSS:

```tsx
// ✅ OK — value is a runtime variable (group color from DB)
<FolderFilled style={{ color: group.color }} />

// ✅ OK — conditional cursor based on prop
<Tag style={{ cursor: onTagClick ? 'pointer' : 'default' }} />

// ❌ Wrong — hardcoded color, must use token
<WarningOutlined style={{ color: '#ff4d4f' }} />   // → token.colorError in createStyles

// ❌ Wrong — structural layout, must use createStyles
<div style={{ display: 'flex', gap: 8 }} />

// ❌ Wrong — CSS variable fallback, must use token in createStyles
<span style={{ color: 'var(--some-var, #666)' }} />  // → token.colorTextSecondary
```

Token equivalents for common hardcoded values:

- `#fff` on colored backgrounds → `token.colorTextLightSolid`
- `'green'` for success icons → `token.colorSuccess`
- `'#ff4d4f'` for error/warning → `token.colorError`
- `'#888'` / `'#666'` secondary text → `token.colorTextSecondary`
- `'#f5f5f5'` background fills → `token.colorFillAlter`

### Dynamic param styles (used in AppHeader, GroupItem)

When styles depend on a boolean flag or runtime value that changes the layout, pass it as a second argument:

```tsx
// AppHeader: sidebarInDrawer changes padding/gap/color
const useStyles = createStyles(({ css, token }, sidebarInDrawer: boolean) => ({
  header: css`
    background: ${token.colorPrimary};
    padding: ${sidebarInDrawer ? '0 12px' : '0 24px'};
  `,
}));
const { styles } = useStyles(sidebarInDrawer); // antd-style caches per unique param

// GroupItem: group color drives radial-gradient background
const useGroupItemStyles = createStyles(({ css, token }, color?: string) => {
  const c = color ?? token.colorPrimary;
  return {
    item: css`
      background: color-mix(in srgb, ${c} 15%, transparent);
    `,
  };
});
const { styles } = useGroupItemStyles(group.color);
```

### Cross-component child targeting

To remove a border from a child component inside a wrapper (e.g. accordion), use the structural selector — **not** a class name, since `createStyles` generates hashed class names:

```tsx
item: css`
  border-bottom: 1px solid ${token.colorBorderSecondary};
  & > div:first-child { border-bottom: none; }  /* removes child's own border */
`,
```

### Container Queries

Declare `container-type: inline-size` on the parent in its `createStyles`, then use `@container` in child component styles:

```tsx
// parent
header: css`
  container-type: inline-size;
`;

// child (separate createStyles)
btnText: css`
  @container (max-width: 540px) {
    display: none;
  }
`;
```

- Ant Design dark/light theme toggled via `ConfigProvider` in `main.tsx`

## Security — NEVER Read or Print

**NEVER read, display, or include in output the contents of `.env`** — it contains `TG_SESSION` (a live Telegram auth token equivalent to full account access), `TG_API_HASH`, and other secrets.

If a task requires knowing env variable names, refer to the list in `ROADMAP.md` (section 9, "Переменные окружения") — names only, never values.  
To rotate the session: `npm run tg:auth` (interactive), then terminate the old session in Telegram → Settings → Active Sessions.

## Auth for Browser-Native Requests

**`EventSource`, `<img src>`, `<video src>` cannot send `Authorization` headers.** Use `?token=` query param instead — `authMiddleware` accepts both forms:

```ts
// ✅ correct pattern (see mediaUrl.ts, useDownloadsSSE)
const token = useAuthStore.getState().accessToken;
const url = `/api/some/stream?token=${encodeURIComponent(token)}`;
const es = new EventSource(url);

// ❌ wrong — EventSource ignores custom headers
new EventSource('/api/some/stream', { headers: { Authorization: '...' } });
```

Always add `accessToken` to `useEffect` deps so the connection re-creates on token refresh.

Use `mediaUrl(localMediaPath)` from `src/client/api/mediaUrl.ts` to generate authenticated `/api/media/…` URLs for `<img>`/`<video>` tags.

## Media Files

- Downloaded to `data/{telegramId}/{filename}` on server disk
- Served via `GET /api/media/:channel/:filename` — supports **HTTP Range requests** (`206 Partial Content`) so browsers can seek videos; always returns `Accept-Ranges: bytes`
- Downloads managed by `downloadManager.ts` — background tasks use size limits (photos ≤ `MAX_PHOTO_SIZE_MB` MB, videos ≤ `MAX_VIDEO_SIZE_MB` MB, image-docs ≤ `MAX_IMG_DOC_SIZE_MB` MB; all env-configurable, defaults 5/75/5); user-initiated (`priority ≥ 10`) bypass limits
- Progress visible in `DownloadsPanel` (header badge + Drawer) via SSE

## Logging

All server-side logging goes through `src/server/logger.ts` — a single **pino** instance:

```ts
import { logger } from '../logger.js'; // adjust relative path

logger.info({ module: 'channels', channelId, inserted }, 'fetch done');
logger.warn({ module: 'telegram', channelId, err }, 'channel unavailable');
logger.error({ module: 'download', workerId, err }, 'worker crashed');
```

- **Dev**: pino-pretty (colourised, `HH:MM:ss`, no pid/hostname)
- **Prod**: JSON to stdout → consumed by Azure Log Analytics automatically
- **Level**: `LOG_LEVEL` env var (default: `debug` in dev, `info` in prod)
- Always include `module` field (`'http'`, `'auth'`, `'channels'`, `'download'`, `'telegram'`, etc.)
- **Never log**: tokens, passwords, email addresses, `TG_SESSION` — only IDs and status codes
- `index.ts` registers `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers
- `rateLimit.ts` logs rate-limit hits with IP + path at `warn` level
- `routes/auth.ts` logs login failures with IP + `reason` field (no credentials in log)

## Service Worker (Media Cache)

`public/sw.js` — vanilla JS Service Worker, **Cache-First** strategy for `/api/media/*`:

- Strips `?token=` from cache key so JWT rotation doesn't bust the cache
- Max 2000 entries, 30-day TTL (configurable via `postMessage`)
- `src/client/services/serviceWorker.ts` — typed registration helper; **only registers in `PROD`** (`import.meta.env.DEV` check) to avoid interfering with Vite HMR
- Registered in `main.tsx` via `registerMediaServiceWorker()`
- **"Clear media cache"** button in `AppHeader` user menu calls `clearSwCache()` with confirm dialog
- Message API: `GET_STATS` → `SwStats`, `CLEAR_CACHE`, `SET_LIMITS { maxEntries, maxAgeDays }`

## Localization (i18n)

**Stack**: `react-i18next` + `i18next` + `i18next-browser-languagedetector`

- **Default language: English (`en`)**, Russian (`ru`) as fallback
- Language choice persisted in `localStorage` key `i18nextLng`
- Config: `src/client/i18n.ts` — imported as side effect in `main.tsx` (`import './i18n'`)
- Translation files: `src/client/locales/en/translation.json` (primary) and `ru/translation.json` (fallback)
- Ant Design locale switches reactively in `main.tsx`: `i18n.language.startsWith('ru') ? ruRU : enUS`
- Language switcher in `AppHeader` user menu — `TranslationOutlined` + `Select`

**Pattern — every component with UI strings must use `useTranslation`:**

```tsx
import { useTranslation } from 'react-i18next';
function MyComponent() {
  const { t } = useTranslation();
  return <Button>{t('mySection.myKey')}</Button>;
}
```

**Rules:**

- Always add new keys to **both** `en/translation.json` AND `ru/translation.json`
- Keys are namespaced by section: `sidebar.*`, `channels.*`, `groups.*`, `news.*`, `filters.*`, `downloads.*`, `auth.*`, `header.*`, `common.*`
- For `Modal.confirm` use `t()` for `title`, `content`, `okText`, `cancelText`
- Interpolation: `t('channels.updated', { date })` → `"updated": "Updated: {{date}}"`
- **Never hardcode Russian or English UI strings directly in JSX** — always use `t()`. This includes button labels, tooltips, aria-labels, Modal strings, and `message.success()` toasts.

## News View Architecture

Two view modes toggled by `newsViewMode` in `uiStore` (persisted to `localStorage`):

| Mode          | Layout                                                   | Default          |
| ------------- | -------------------------------------------------------- | ---------------- |
| `'list'`      | 2-pane: `NewsFeedList` (380px) + `NewsDetail` panel      | Desktop          |
| `'accordion'` | Single column: `NewsAccordionList` → `NewsAccordionItem` | Mobile (< 768px) |

**Responsive override**: `useMobileBreakpoint(768)` in `NewsFeed` → `effectiveViewMode = isMobile ? 'accordion' : newsViewMode`. View-toggle buttons are hidden on mobile.

**Shared components** — both modes reuse: `NewsListItem` (collapsed accordion row), `NewsDetail` (expanded accordion body), all `NewsDetail*` sub-components.

**`NewsDetail` variant pattern**:

```tsx
// panel (default): sticky header, fixed height, date+tags in toolbar left
<NewsDetail item={item} channelType={...} variant="panel" />

// inline (accordion expanded): static header, auto-height, title+date+tags in toolbar left,
// left area is clickable to collapse the accordion item
<NewsDetail item={item} channelType={...} variant="inline" onHeaderClick={() => onSelect(null)} />
```

**Known keyboard caveat**: `NewsDetail`'s `keydown` handler excludes `input / textarea / button / a` but NOT `video`. `useNewsHotkeys` intercepts `ArrowUp`/`ArrowDown` globally and calls `e.preventDefault()` — this blocks native video volume-control keys when the `<video>` element has focus. Arrow Left/Right (seek) are not blocked. If editing hotkey logic, add `tag === 'video'` to the exclusion check.

**Hotkey listener phases**: `NewsDetail` registers its `keydown` listener with `{ capture: true }` so it always fires **before** `useNewsHotkeys` (which uses the default bubble phase). This is essential for `stopImmediatePropagation()` to work in the album Space-advance case — without capture, the parent's listener may be registered first and process the event before the child can stop it.

**Component decomposition** (`src/client/components/News/`):

- `NewsDetail` — state coordinator (queries, album index, top panel, hotkeys, handlers); requires `channelTelegramId: string` prop
- `NewsDetailBody` — pure display: `NewsDetailMedia` + text body + link-select Modal
- `NewsDetailToolbar` — header row; `variant='inline'` shows full title + clickable meta area; always renders the Open button using `openUrl` (= `firstLink ?? https://t.me/{channelTelegramId}/{msgId}`) + `isExternalLink` boolean for tooltip switch
- `useHashTagSync(channelId)` — URL hash ↔ `hashTagFilter` sync
- `useMobileBreakpoint(n)` — resize-reactive boolean
- `useNewsHotkeys(items, selectedId, setId, onSpace)` — ↑↓Space keyboard nav

**`uiStore` fields added for news view**:

- `newsViewMode: 'list' | 'accordion'` — user preference, persisted
- `NewsViewMode` type exported from `uiStore.ts`

## Resilience Layer

### Client-side retries

- **`ApiError`** (`src/client/api/client.ts`) — typed HTTP error with `status: number`; thrown by `request()` instead of plain `Error`
- **Network retry**: `fetchWithNetworkRetry()` wraps bare `fetch()` — retries `TypeError` ("Failed to fetch") up to 3× with **500ms → 1s → 2s** backoff; `AbortError` never retried
- **TanStack Query retry** (`src/client/main.tsx`): 4xx `ApiError` → `return false` (no retry); 5xx / network → up to 3 attempts with **1s → 2s → 4s → 30s cap** exponential backoff. Mutations stay at default `retry: 0` — don't add global mutation retry (duplicate writes)

### Server-side: Telegram circuit breaker

`src/server/services/telegramCircuitBreaker.ts` — singleton `telegramCircuit`:

- **Retry**: 3 attempts; `FloodWaitError` → waits exactly `error.seconds * 1000ms`; other transient errors → **2s → 4s → 8s**; permanent errors (wrong username, missing media) pass through immediately
- **Circuit breaker**: opens after **5 consecutive transient failures**, half-opens after **30s**, closes on first success; logs every state transition at `warn`/`error`/`info`
- All exported functions in `telegram.ts` are wrapped: `fetchChannelMessages`, `getChannelInfo`, `getReadInboxMaxId`, `readChannelHistory`, `fetchMessageById`, `downloadMessageMedia` (only the `tg.downloadMedia` call, not the local size checks)
- `GET /api/health` exposes circuit state: `{ status: 'ok'|'degraded', telegram: { circuit: 'closed'|'open'|'half-open', connectDelayed } }`
- `GET /api/ready` — readiness probe: returns 200 when Telegram is connected, 503 during startup delay

### Deploy safety — preventing AUTH_KEY_DUPLICATED

Telegram allows only one connection per auth key. During deploys, old and new containers overlap → both connect → `AUTH_KEY_DUPLICATED`. Three mechanisms prevent this:

1. **Startup delay** (`TG_CONNECT_DELAY_SEC`, default 30 in prod): new container delays its first Telegram connection, giving time for the old one to shut down. Timer starts at module load, not at first request.
2. **Graceful shutdown** (SIGTERM handler in `index.ts`): old container calls `disconnectTelegramClient()` on SIGTERM, releasing the auth key before the process exits.
3. **Readiness probe** (`/api/ready`): returns 200 immediately so Azure switches traffic and kills the old container **fast**. Configure via `scripts/setup-health-probes.sh` (one-time).

**Correct deploy timeline:**

1. New container starts, `/api/ready` → 200 immediately
2. Azure switches traffic → sends SIGTERM to old container (~5-10s after start)
3. Old receives SIGTERM → `disconnectTelegramClient()` → session freed (~10s)
4. Telegram delay still counting (30s total) → new does NOT connect yet
5. Delay expires (t=30s) → old is long dead → new connects cleanly

> ⚠️ **Readiness probe must NOT return 503 during Telegram delay.** If it does, Azure won't kill the old container → old stays connected → when delay expires, both containers are connected simultaneously → `AUTH_KEY_DUPLICATED`. The delay must be invisible to Azure — it's an internal application-level gate.

### Server-side: download worker retry

`src/server/services/downloadManager.ts`:

- Inner retry loop in `runWorker`: up to `DOWNLOAD_MAX_RETRIES` (env, default 3) attempts per task
- Transient: `FloodWaitError`, `ECONNRESET`, `ETIMEDOUT`, `circuit breaker OPEN` → retry with **30s → 60s → 120s** backoff
- Permanent: "No media in message", "size limit", "Article task missing URL" → fail immediately
- **`spawnWorker(id)`** — self-healing: if `runWorker()` throws (shouldn't, but safety), restarts after 5s

### Azure boundary

Azure App Service / Container Apps handles: process-level crash recovery (containers restart), TCP-level retries, health probing against `/api/health` (liveness) and `/api/ready` (readiness). Custom probes configured via `scripts/setup-health-probes.sh`. It does **not** retry application logic — that's all in code above.

## Logging Pipeline

```
Client logger.warn/error
  → POST /api/log/client (batched 2s; errors flush immediately; keepalive: true)
  → server/routes/logIngest.ts → pino logger (module: 'client:xxx')
  → stdout JSON (prod) / pino-pretty (dev)
  → Azure Container Apps captures stdout → Log Analytics Workspace
  → KQL queries
```

**Pino in prod** emits one JSON line per log call (no transport configured — raw stdout). Azure automatically ingests it into `ContainerAppConsoleLogs_CL`. Fields like `module`, `status`, `ms` become queryable. KQL example:

```kusto
ContainerAppConsoleLogs_CL
| extend log = parse_json(Log_s)
| where log.level >= 40  // warn+
| project TimeGenerated, module=log.module, msg=log.msg
```

**Client logger** (`src/client/logger.ts`): `debug`/`info` → console only; `warn`/`error` → console + batched POST to `/api/log/client`. Prod level default: `warn` (override: `VITE_LOG_LEVEL`). Server level default: `info` in prod (override: `LOG_LEVEL`).

## Monitoring

### alertBot — instant Telegram push (`src/server/services/alertBot.ts`)

Calls Telegram Bot API directly from the Node.js process. **No-op when env vars absent** — safe to call unconditionally everywhere.

```ts
import { sendAlert } from './alertBot.js';
void sendAlert('message text', 'optional-dedup-key'); // dedup: 5-min cooldown per key
```

**Currently fires on:**

- `uncaughtException` → `logger.fatal` + `sendAlert` → `process.exit(1)` (`index.ts`)
- `unhandledRejection` → `logger.error` only (process continues)
- Download worker crash → `logger.error` + `sendAlert` (`downloadManager.ts`)
- Telegram circuit breaker OPEN → `logger.error` + `sendAlert` (`telegramCircuitBreaker.ts`)
- `AUTH_KEY_UNREGISTERED` → `sendAlert` (`telegramCircuitBreaker.ts`)
- Server startup (prod only) → `sendAlert('🟢 Server started')` (`index.ts`)

**To enable** — set on the Container App:

> ⚠️ **`--set-env-vars` replaces the entire env var list** — do NOT run with only these two keys or all other vars will be wiped.  
> Safe approach: use **Azure Portal** → Container App → Configuration → Environment variables → add individual variables there.  
> If using CLI, always include the full list of all vars (see ROADMAP.md "Переменные окружения" for the complete set).

```bash
# Safe: add secrets first, then reference them
az containerapp secret set --name tg-news-reader --resource-group personal-apps-rg \
  --secrets alert-bot-token=<token> alert-chat-id=<chat_id>

# Then in Azure Portal, add env vars ALERT_BOT_TOKEN=secretref:alert-bot-token etc.
```

How to get values: open [@BotFather](https://t.me/BotFather) → `/newbot` → copy token. Send any message to the bot, then `curl https://api.telegram.org/bot<TOKEN>/getUpdates` → read `result[0].message.chat.id`.

To also enable deploy-failure alerts from GitHub Actions, add `ALERT_BOT_TOKEN` + `ALERT_CHAT_ID` as **GitHub Secrets** (same values).

### Azure Monitor Alerts (already deployed — `personal-apps-rg`)

Two alert rules send email to `sceletron@gmail.com` via Action Group `tg-reader-alerts`:

| Rule                   | Trigger                                    | Delay   |
| ---------------------- | ------------------------------------------ | ------- |
| `tg-reader-error-logs` | KQL: `log.level >= 50` in 5-min window     | 1–5 min |
| `tg-reader-restart`    | Metric: `RestartCount > 0` in 5-min window | 1–5 min |

To recreate from scratch on a different subscription: `scripts/setup-monitoring.sh` (fill in vars at the top). **Note**: the bash script's KQL uses `|` pipes — on Windows/PowerShell use `az rest --body @file.json` instead (see `C:\Users\dshilov\alert-kql-rule.json` as reference body).

### UptimeRobot (optional — external HTTP monitor, **currently NOT active**)

Checks `/api/health` from outside Azure every 5 min. Catches what Azure Monitor can't: Azure region outage, event-loop freeze, etc.

> ⚠️ **Side effect with scale-to-zero**: a 5-min UptimeRobot interval will wake the container every 5 min via KEDA HTTP scaler, causing a constant sleep/wake cycle. Consider 15–30 min interval or skip entirely — Azure Monitor + alertBot already cover crashes.

> ℹ️ **SSE wake-up**: `useDownloadsSSE()` (EventSource) auto-reconnects when the server goes to sleep. If a browser tab is open (even in background), it will wake the container every few minutes. This is expected behavior — the tab keeps the app alive while in use.

1. Register free at [uptimerobot.com](https://uptimerobot.com)
2. Add monitor: type `HTTP(s)`, URL `https://tg-news-reader.graycoast-407e8a98.westeurope.azurecontainerapps.io/api/health`, interval 15 min
3. Alert Contacts: add Telegram (native support) or email
