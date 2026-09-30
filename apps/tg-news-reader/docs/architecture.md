# TG News Reader — Architecture & Implementation Notes

> Detailed notes on implemented features. For the living codebase architecture see `AGENTS.md`.

---

## 1–4. Sidebar: Segmented, badges, splitter, adaptive buttons

### Toolbar: period buttons (Segmented)

- `[↻]` — standalone button, always clickable; on first fetch syncs read position via `readInboxMaxId` from Telegram; on subsequent fetches uses `lastFetchedAt` (DB boundary)
- `<Segmented>` with periods `[1d][3d][5d][7d][14d]` + `[↺]` (since last sync)
- Resets on channel switch; no initial selection — every click triggers a fetch

### Unread badges

- `unreadCount` in `GET /api/channels` (LEFT JOIN news WHERE is_read = 0)
- Badge = `unreadCount` from the channel list query
- Single-post optimistic updates adjust the badge only when cached `isRead` actually changes, once across all feed caches. If the post is not cached, the channel count is refreshed after saving instead of guessing a delta.
- The lightbox automatically marks downloaded media/blog posts read. Explicit close (toolbar, Escape, backdrop, or browser Back) also marks the current downloaded post read in news/news-link channels, without requiring navigation. Unavailable media remains unread; revisiting read posts does not decrement the badge or send additional read requests.
- The lightbox observes the active All/Filtered/Hidden feed cache, including its tag scope, without refetching the feed on open. Missing images are requested automatically once per viewing session using an image-only queue task; undownloaded videos and non-image files are skipped without marking them read. Download completion updates the visible image in place; REST polling while waiting recovers missed SSE updates.
- The lightbox has no manual Telegram-to-server Download/Re-download control. Already downloaded videos remain playable, and the native video menu still offers saving to the device. Album counters count available media, not skipped video slots.
- In the detail view, Space advances through available album media before marking the post read. Missing album slots block Space only while a media download is pending or processing; skipped or failed downloads do not trap navigation. Detail hotkeys are suspended while the lightbox is open, and focused videos retain their native playback and volume keys.
- Video-only toolbar buttons rotate the current clip left/right by 90 degrees. Rotation is presentation-only, resets on media navigation, and preserves playback position and the original download/share file. The rotated frame is fitted to the available area using video metadata and a resize observer.
- Mark All supports one immediate undo for the current view. Channel refresh (including sidebar/bulk refresh), changing channel/group/tag/view filter, or changing auto-advance resets that undo. Late responses from an older view cannot restore it. Empty scoped views never send an unscoped mark-all request.
- **Refresh** button → `POST /api/channels/count-unread` — counts only, uses `lastFetchedAt`
- `lastFetchedAt` is the DB boundary: everything before it is already stored; only newer messages need to be fetched
- `lastReadAt` is the unread display boundary: used only on first-ever channel fetch to align with Telegram's read position
- ⚠️ `count-unread` uses `lastFetchedAt` directly — using `lastReadAt` would double-count already-fetched unread messages

### Splitter

`<Splitter>` from Ant Design 6, `defaultSize=280`, `min=200`, `max=500`.

### Channel information

On desktop, hover or click the channel's information button to open a rich metadata popover.
On mobile, open information from the three-dot menu instead; there is no separate info button or hover trigger.
The popover shows the saved description as safe Markdown, channel type/group, post counts, timestamps,
and server media storage in readable units plus exact bytes and file count. Descriptions come from
Telegram lookup or user edits, not a live Telegram request.
Missing descriptions are omitted. The card shows the measurement timestamp without cache/extraction notes.
Hover opens a transient card without a Close button; clicking/tapping or keyboard activation pins it with
an explicit Close button. The header remains outside the scrollable details region on short screens.
Permanent Telegram access/username errors during refresh persist `isUnavailable` and return HTTP 422;
a successful retry clears the flag. Transient failures do not mark a channel unavailable.
Refresh errors are shown to the user, and both successful and failed refreshes reconcile the channel
and news caches, including bulk refresh and mark-read-and-fetch.

`GET /api/channels/:id/storage` is requested only when the popover is open. It measures the channel's
actual server directory, including partial/orphaned files, but excludes the shared database, TTS, and
browser cache. Measurements include a timestamp and use separate one-minute server/client caches.
The endpoint checks authentication and persisted PIN unlock state before consulting the cache.
Scans have bounded concurrency, queue, entry/depth/time limits and reject symlink paths; failures are
shown explicitly with a retry button rather than reported as zero bytes. This is a logical file-size
total, not filesystem allocation or an atomic snapshot while downloads/cleanup are running.

### Adaptive buttons (text→icons)

Implemented via **CSS Container Queries** — native browser standard, no JS:

```css
/* container-type: inline-size on parent */
@container (max-width: 300px) {
  .btn-text {
    display: none;
  }
}
```

"Refresh" and "Add" labels hide when sidebar width ≤ 300px.

---

## 5–6. Channel groups with PIN

### DB Schema

```sql
CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#1677ff',
  pin_hash TEXT,        -- bcrypt(pin, saltRounds=10) or NULL
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- channels: added group_id (FK → groups ON DELETE SET NULL) and sort_order
```

### Implementation

- `GroupPanel` — 72px left panel; buttons with `FolderFilled` in group color, radial-gradient bg via `color-mix`
- Group badge = sum of `unreadCount` for all channels in the group
- `selectedGroupId === null` → "General" (channels without group_id)
- PIN: `bcrypt(pin, 10)` → `POST /api/groups/:id/verify-pin` → `unlockGroup(id)` in uiStore (in-memory)
- After PIN verification, server updates `sessions.unlocked_group_ids` and issues a new access token

### API

```
GET    /api/groups
POST   /api/groups
PUT    /api/groups/:id          (pin: null = remove PIN)
DELETE /api/groups/:id          (channels → group_id = null)
POST   /api/groups/:id/verify-pin
```

---

## 9. Authentication (password + TOTP 2FA + JWT)

### DB Schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,   -- bcrypt(password, 12)
  totp_secret TEXT,              -- NULL = 2FA disabled
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- UUID v4
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  unlocked_group_ids TEXT NOT NULL DEFAULT '[]',
  user_agent TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### Token strategy

- **Access token**: JWT 15 min, in-memory only (NOT localStorage), payload: `{ sub, role, sessionId, unlockedGroupIds }`
- **Refresh token**: UUID 7 days, httpOnly cookie (`sessionId:token`), bcrypt hash in sessions

### Routes

```
POST   /api/auth/login           email + password [+ totp_code]
POST   /api/auth/refresh         refresh cookie → new access token
POST   /api/auth/logout          delete session + clear cookie
GET    /api/auth/totp/setup      QR code for 2FA
POST   /api/auth/totp/confirm    verify and activate
DELETE /api/auth/totp            disable 2FA
GET    /api/auth/sessions
DELETE /api/auth/sessions/:id
```

---

## 10. Service Worker media cache

`public/sw.js` — **Cache-First** for `GET /api/media/*`:

- Strips `?token=` from cache key — JWT rotation doesn't bust the cache
- Max 2000 entries, 30-day TTL (configurable via `postMessage`)
- Registers in production only (`import.meta.env.DEV` guard)
- `getSwStats()` → `SwStats`; "Clear media cache" button in AppHeader → `clearSwCache()`

---

## 11. Logging

Stack: `pino` (JSON in prod, pino-pretty in dev). Level: `LOG_LEVEL` env (default `debug`/`info`).

| Level   | Event                                                          |
| ------- | -------------------------------------------------------------- |
| `info`  | Server start, channel fetch (inserted/total), download done    |
| `warn`  | Task failed, Telegram unavailable, auth fail (no email in log) |
| `error` | Unhandled exception, worker crash                              |
| `debug` | (dev only) Telegram request details                            |

Structure: `{ level, time, module, ...fields, msg }`. In Azure Container Apps, stdout → Log Analytics automatically.

---

## 12. Localization (i18n)

- **react-i18next** + **i18next-browser-languagedetector**
- English by default, Russian fallback; language stored in `localStorage`
- Ant Design locale via `<ConfigProvider locale={antdLocale}>`
- Key namespaces: `sidebar.*`, `channels.*`, `groups.*`, `news.*`, `auth.*`, `header.*`, `downloads.*`, `filters.*`, `common.*`

---

## 13. Download Manager

### DB Schema

```sql
CREATE TABLE downloads (
  id INTEGER PRIMARY KEY,
  news_id INTEGER NOT NULL REFERENCES news ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'media' | 'article' | 'image'
  url TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at INTEGER,
  processed_at INTEGER,
  UNIQUE(news_id, type)
);
```

### Worker pool architecture

`downloadManager.ts` is a **coordinator** (main thread); actual work runs in `worker_threads`:

```
Main thread (DownloadCoordinator)
  ├── polls DB for pending tasks
  ├── dispatches { type:'task', payload } to an available worker
  ├── routes tg:* IPC messages → telegramBridge (gramjs lives in main thread)
  └── emits SSE events via downloadProgressEmitter

Worker thread (downloadWorker.ts / downloadWorkerShim.mjs)
  ├── 'article' task: fetch HTML → parseHtml() with jsdom + Readability (CPU-bound,
  │    does NOT block main event loop) → writes fullContent to DB via own libsql connection
  └── 'media' task:   sends tg:downloadMedia IPC → awaits tg:result/tg:error reply
                       → writes localMediaPath(s) to DB
```

**File-reference freshness** (`telegramBridge.ts`): every `tg:downloadMedia` IPC call starts with `fetchMessageById(channelTelegramId, msgId)` to get a fresh `rawMedia` object before calling `downloadMedia()`. Telegram file references have a TTL; re-fetching on every attempt (not just on retry) means stale references are never used and the "file reference expired" error cannot occur.

**Dev vs prod worker entry-point:**

- **Dev**: `downloadWorkerShim.mjs` — plain `.mjs` that calls `register('tsx/esm')` then dynamically imports `downloadWorker.ts`; the only reliable way to activate tsx hooks in `worker_threads` with Node.js 22.12+.
- **Prod**: `downloadWorker.js` (compiled) — loaded directly, no loader needed.

**jsdom / Readability loading**: lazy-loaded on first article task per worker (avoids ~2 s / ~100 MB startup cost for media-only workers); each thread has its own module scope — no shared state.

### Public API

- `enqueueTask(newsId, type, url?, priority=0)` — INSERT with `onConflictDoUpdate`, resets failed → pending, keeps MAX(priority)
- `startWorkerPool(n)` — called in `server/index.ts`; resets `processing → pending` on startup (crash recovery)
- Priorities: 10 = user-initiated (size limits bypassed), 5 = background images (photos and image documents), 0 = other background media. Equal priorities use creation time, then task ID (FIFO).
- `downloadPriority.ts` supplies the same ordering for dispatch and the visible queue. Already-queued photos receive effective priority 5 without a DB migration; image documents are classified by MIME type when enqueued. Running tasks are not preempted.
- Pool circuit breaker: ≥ ⌈N × ratio⌉ crashes in sliding window → `logger.fatal` + `sendAlert` + `process.exit(1)`
- Auto-cleanup of done tasks after `DOWNLOAD_TASK_CLEANUP_DELAY_MS` ms (default 30 s)
- SSE: `GET /api/downloads/stream` — `init`, `task_update`, `tasks_removed` (news cleanup),
  `task_removed` (manual cancellation) and `queue_changed` (priority/retry) events.
- Cancel deletes pending/failed tasks atomically and updates connected queues. If a worker already claimed the
  task, cancellation returns 409 instead of pretending to interrupt an active transfer.
- Prioritize raises priority to at least 10, resets failed tasks for retry (including already-manual tasks),
  and refreshes the queue order. Action buttons show pending state and request errors.

**Storage recovery**: the shared storage gate preserves `DOWNLOAD_STORAGE_RESERVE_BYTES` (default 1 GiB) and periodically retries paused tasks (up to 60 seconds between capacity probes). Successful media-file cleanup emits `storage_freed`; the coordinator immediately expires the pause cooldown, rechecks actual capacity, and resumes pending work only if enough space is available. Cleanup in worker threads forwards the notification to the main thread. Failed or missing-file deletions do not trigger recovery.

Removing queued tasks also triggers a capacity recheck: the size of a deleted, oversized download must not keep smaller remaining tasks paused. Each new file still undergoes its own size/reserve check.

**Read/filtered news**: filtered items do not auto-download media during channel fetch. Opening an image in the lightbox explicitly requests an `image` preview, including in Hidden only; this downloads photos/image documents only, retaining image size limits and skipping video even in mixed albums. Channel refresh deletes read news and cascades deletion of their download tasks, notifying the queue via `tasks_removed`. Workers discard media returned after a news row was deleted instead of leaving orphan files.

- `DownloadsPanel` / `DownloadsPinnedContent`: when both `media` and `article` tasks are active, the task list renders two sections ("Media" / "Articles") separated by a labelled divider.

### Orphan media maintenance

Run from the application directory with the **matching database and mounted `data` volume**:

```powershell
# Preview only; no media is deleted
npm run media:cleanup

# Stop ALL app replicas and other storage writers first
npm run media:cleanup -- --apply --offline
```

The standalone utility and its tests live in `scripts/media-cleanup`; it is not part of the running server
or the production image. Run it from a checkout with development dependencies installed (`tsx` is required).
On Azure, use a separate maintenance environment with that checkout, the same mounted volume and database
configuration, with every application replica stopped for `--apply`. A local run only scans the local
`data` directory unless the target storage is mounted there.
Do not run against production storage with an unrelated or empty database. Back up the volume before applying.

- Loads all news references, including single media, albums, and Instant View images embedded in article content.
  Read/filtered news still protect their files while their rows exist.
- Scans direct channel folders, including folders of deleted channels. No Azure credentials or listing API
  are needed: it enumerates the mounted filesystem. Scanning progress uses folders completed/total plus
  file counts; deletion progress uses candidates processed/total.
- Removes only unreferenced application-named media and abandoned `.part` files. SQLite/root files,
  `tts` (managed separately), unknown filenames, symlinks and nested directories are left alone.
- Reports candidate/deleted file counts, exact logical bytes, skipped entries and errors, ending with a JSON summary.
  `bytesDeleted` is the sum of successfully unlinked file sizes, not an Azure quota/free-space measurement.
  Failed deletions are logged and produce a nonzero exit code; DB/listing failures abort before deleting anything.
- Applying requires `--offline` acknowledgement and reserves `SERVER_PORT` (default 3173), refusing if a local
  app already owns it. This port guard cannot detect writers in other containers: stopping all replicas is mandatory.
  A `.media-cleanup.lock` file prevents concurrent maintenance runs. If a run is forcibly killed,
  remove **only that file**, after confirming no cleanup is still running, before retrying.
- Cleanup is deliberately offline: a downloaded file can exist before its news row is updated, so deleting
  apparently unreferenced files while workers/fetches are active would risk deleting valid downloads.
  Restart the app afterwards; the worker pool performs its normal capacity check and crash recovery.

---

## 16. Azure deployment

- `newsViewMode: 'list' | 'accordion'` in `uiStore` (persisted to localStorage)
- `effectiveViewMode` in `NewsFeed` — forces accordion on mobile (`< 768px`)
- `NewsDetail` variant: `'panel'` (list mode) and `'inline'` (accordion)
- Sticky accordion header: `position: sticky; top: 0; z-index: 10`

---

## 15. Adaptive layout

- BP constants: `BP_SM/MD/LG/XL/XXL` = Ant Design breakpoints
- `<Splitter>` only on `xxl` (≥ 1600px); sidebar in `<Drawer>` on `< xxl`
- `DownloadsPanel` pinned mode only on `xxl`
- Open issues: touch targets (hashtag tags and checkbox); Safari iOS Splitter not active on touch

---

## 16. Azure deployment

### Stack

| Component             | Service                          | ~Cost/mo |
| --------------------- | -------------------------------- | -------- |
| Backend (Hono + Node) | Container Apps                   | ~$5–15   |
| DB                    | Turso                            | $0–29    |
| Images                | Azure Container Registry (Basic) | $5       |
| SSL                   | Container Apps TLS               | ~$0.5    |

### Container App configuration

- Scale: `minReplicas=0`, `maxReplicas=10`, **`cooldownPeriod=1800`** (30 min — updated 2026-03-28)
- Base image: `node:22-bookworm-slim` (glibc — compatible with `@libsql/client` and `jsdom`)
- Multi-stage Dockerfile: builder → runner (prodDeps only + `dist/`)
- Full env vars reference: [docs/azure.md](azure.md)

### Turso note

`db/index.ts` runs `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;` **only when `DATABASE_URL` is not set** (i.e. local SQLite). On Turso, `client.executeMultiple` with PRAGMA statements returns HTTP 400 — these settings are managed server-side on Turso anyway.

---

## 17. Monitoring & fail detection

### Azure Monitor Alerts (deployed in `personal-apps-rg`)

| Rule                   | Trigger                | Window                          | Delay   |
| ---------------------- | ---------------------- | ------------------------------- | ------- |
| `tg-reader-error-logs` | KQL: `log.level >= 50` | 5 min                           | 1–5 min |
| `tg-reader-restart`    | `RestartCount > 1`     | **15 min** (updated 2026-03-28) | 1–5 min |

Recreate: `scripts/setup-monitoring.sh`. PowerShell: `az rest --body @file.json`.

### alertBot

`src/server/services/alertBot.ts` — no-op when env vars absent. Fires on:
`uncaughtException`, worker crash, circuit breaker OPEN, `AUTH_KEY_UNREGISTERED`, server startup (prod).

### Alert stack

| Event                                             | Channel                                 | Delay     |
| ------------------------------------------------- | --------------------------------------- | --------- |
| `uncaughtException` / worker crash / circuit OPEN | alertBot → Telegram                     | immediate |
| Deploy failed (CI)                                | GitHub Actions → Telegram               | immediate |
| `logger.error/fatal`                              | Azure Monitor KQL → email               | 1–5 min   |
| Container restart / OOM                           | Azure Monitor Metric → email            | 1–5 min   |
| Server unreachable                                | UptimeRobot → Telegram/email (optional) | ≤5 min    |

---

## 18. Accessibility (a11y)

### Implemented

- **Tab navigation**: `role="option"`, `aria-selected`, `tabIndex={0}`, `onKeyDown` (Enter/Space) on `ChannelItem`, `GroupItem`, `NewsListItem`
- **ARIA**: `<nav aria-label>` on `ChannelSidebar` and `GroupPanel`; `role="listbox"` on news lists; `aria-expanded` on `NewsAccordionItem`
- **Focus-visible**: `outline: 2px solid token.colorPrimary`; double ring for primary buttons; Segmented via `:has(input:focus-visible)`
- **Touch**: `MaybeTooltip` — renders only children without tooltip on `pointer: coarse` (9 files)

### Left for future

- [ ] Skip-link (`<a href="#main-content">`)
- [ ] Focus management on Drawer open/close
- [ ] `DownloadsPanel`: `aria-live="polite"` on task counter
- [ ] `NewsDetailMedia`: `tabIndex` on Prev/Next buttons in album carousel
- [ ] Lighthouse / axe audit (target ≥ 90)

---

## 19. AI digest

### Provider

Single code, two providers via `baseURL`:

```ts
// src/server/services/openaiClient.ts
const client = process.env.AZURE_OPENAI_ENDPOINT
  ? new OpenAI({
      apiKey: process.env.AZURE_OPENAI_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
      defaultQuery: { 'api-version': '2024-02-01' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_KEY },
    })
  : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

### API & limits

```
POST /api/digest
Body: { channelIds?: number[], groupId?: number | null, since?: string, until?: string }
Response: SSE stream (text/event-stream)
```

- If news count > 200 — takes the latest 200
- UI: "Digest ✨" button in toolbar, streams into `<Drawer>` with `react-markdown`

### Content enrichment for `news_link` channels

The digest route joins `channels` and selects `fullContent`, `links`, `canLoadArticle`, `channelType` alongside each news row. Prompt content per item uses `COALESCE(fullContent, text)`:

- Items with `fullContent` already populated → up to `DIGEST_ARTICLE_CONTENT_LIMIT` chars (env, default 1500)
- Items without `fullContent` → `text` capped at 500 chars (legacy behaviour)

### Article prefetch phase (Phase 1)

For `news_link` items where `fullContent IS NULL` and `canLoadArticle = 1`, the digest route runs a prefetch phase **before** starting the AI call:

1. Enqueues an `article` download task at `priority=10` for each such item via `enqueueTask()` — these tasks appear in `DownloadsPanel` automatically.
2. Emits `prefetch_progress { done, total, errors }` SSE events every 500 ms while polling `downloads` + `news` tables.
3. Exits when all tasks settle (`remaining = 0`) or `DIGEST_ARTICLE_PREFETCH_TIMEOUT_SEC` elapses (env, default 30 s).
4. Re-fetches `fullContent` for all prefetch items; remaining failures fall back to `text`.
5. Only then begins Phase 2 (AI generation): `ref_map → chunk* → done`.

Client: `DigestDrawer` shows an Ant Design `<Progress type="circle" />` (80 px) during Phase 1 with live `done / total` counter and an error hint when `errors > 0`. Clears on first `chunk` event, transitions to streaming text.

Config: `DIGEST_ARTICLE_CONTENT_LIMIT` (default 1500), `DIGEST_ARTICLE_PREFETCH_TIMEOUT_SEC` (default 30).

### Source link chips

The digest prompt instructs the model to annotate each mentioned news item with `[N]` references (1-based index). The `<Drawer>` renders these as clickable Ant Design `<Tag>` chips — clicking calls `setSelectedNewsId(items[N-1].id)` to navigate directly to the source item in the feed.

---

## 20. Client-side gramjs download (deferred)

**Implementation options:**

- **A**: server returns `{ fileId, accessHash, dcId, fileReference }`, client downloads via gramjs
- **B**: server returns a signed proxy URL

Session sharing: sharing the main session is simpler but less secure. Decide at implementation time.

---

## 21. Media folder download (deferred)

- **File System Access API**: `showDirectoryPicker()` → user picks folder
- Browsers: Chrome/Edge ✅, Safari 15.2+ ✅, **Firefox ❌**
- Depends on item 20 (at least partially)

---

## 22. Filters — hit_count sorting

`filters` table has a `hit_count INTEGER NOT NULL DEFAULT 0` column incremented each time a filter matches a news item during fetch. The Filters panel (`src/client/components/Filters/`) displays a **Hits** column sorted descending by default so the most active filters surface to the top. No extra API changes — `GET /api/filters` returns `hit_count` and sorting is done client-side via the Ant Design `Table` `defaultSortOrder`.

---

## 23. Channel t.me links

Both `ChannelItem` (sidebar) and `NewsFeedToolbar` show an external-link icon button that opens `https://t.me/{channel.telegramId}` in a new tab. The URL is constructed from the `telegramId` field already present on every channel object — no extra API fields required.

---

## 24. Boss key (double Esc)

Double-pressing `Escape` within 500 ms immediately re-locks **all** PIN-protected groups for the current session:

- Listener registered in `AppLayout` (or a top-level hook) on `keydown` with `{ capture: true }`.
- First `Escape` within the window records `lastEscTime`; second `Escape` within 500 ms calls `authStore.lockAllGroups()`.
- `lockAllGroups()` calls `POST /api/auth/sessions/lock-groups` which clears `unlocked_group_ids` in the DB session and returns a new access token with an empty `unlockedGroupIds` list.
- `authStore.updateToken()` replaces the in-memory access token; Zustand `unlockedGroupIds` resets to `[]`.
- Groups whose PIN was not verified become inaccessible again until re-entered.

---

## 25. Error pages

### React crash boundary (`AppErrorBoundary` + `ErrorPage`)

`src/client/components/AppErrorBoundary.tsx` wraps the entire React tree in `main.tsx`. On an unhandled render error it shows `ErrorPage` — a centered card with a floating emoji animation, the error message, and a **Retry** button that calls `window.location.reload()`. The boundary also logs the error via the client logger (`logger.error`).

### Server HTML error pages (Hono)

`src/server/index.ts` registers:

```ts
app.notFound((c) => c.html(errorHtml('404', 'Page not found'), 404));
app.onError((err, c) => c.html(errorHtml('500', err.message, stack), 500));
```

`errorHtml()` is a template literal that:

- Respects `prefers-color-scheme` (dark/light) via a `<style>` media query
- Shows the stack trace only when `NODE_ENV !== 'production'`
- Returns a minimal styled HTML page (no external dependencies)

---

## 27. Mobile UX: pull-to-refresh & compact toolbar

### Pull-to-refresh (`usePullToRefresh`)

`src/client/hooks/usePullToRefresh.ts` — vanilla touch-event hook, no library:

- Activates only at `scrollTop === 0` to avoid conflicting with native browser PTR
- `touchmove` registered as **non-passive** so `preventDefault()` can be called when pulling (skipped if already non-cancelable)
- Direct DOM style mutations on `indicatorRef` — no React re-render during the pull gesture
- Arrow icon rotates 180° when pull distance crosses `THRESHOLD = 72px`; `DAMPEN = 0.55` gives a springy feel
- On `touchend`: if threshold crossed → `onRefresh()`; always snaps indicator back with CSS transition
- Used in `NewsAccordionList` (accordion / mobile mode only, `enabled` prop gates the listeners)

### Compact accordion toolbar (`NewsDetailToolbar` inline variant)

When `variant='inline'` (accordion expanded item), replaces the full button row with a layout that mirrors `NewsListItem` structure:

```
[☐ checkbox]  [title (2-line clamp)]      [✓ primary] [⋯ dropdown]
              [date DD.MM.YY HH:mm]                   [#tags]
```

- **Checkbox** (left, `flex-shrink:0`) — left-hand mark-read, visually identical to collapsed item
- **`✓` button** (right, primary when unread) — right-hand mark-read
- **`⋯` Dropdown** — contains: Refresh, Links (if any, checkmark when active), Text (if any, checkmark when active), Load Article (if applicable), Open
- Date uses `11px / white-space:nowrap` matching `NewsListItem.metaDate` exactly
- Title uses same 2-line `-webkit-line-clamp` as `NewsListItem.title`
- Desktop panel variant (`variant='panel'`) is unchanged

---

## 26. Telegram session expiry (AUTH_KEY_UNREGISTERED)

Three-layer response when gramjs throws `AUTH_KEY_UNREGISTERED`:

### Layer 1 — Auto-reconnect (server, `telegramCircuitBreaker.ts`)

`handleAuthKeyUnregistered()` runs before marking the session as expired:

```
1. Calls _reconnectFn() — injected by telegram.ts via setReconnectCallback()
2. _reconnectFn() = () => getTelegramClient()  →  new TelegramClient + client.connect()
3. On success: _sessionExpired stays false, circuit stays closed
4. On failure: _sessionExpired = true  →  sendAlert() + GET /api/health returns sessionExpired: true
```

`_reconnectFn` is a plain `() => Promise<void>` injected at startup to avoid a circular import (`telegram.ts` → `telegramCircuitBreaker.ts` → `telegram.ts`).

### Layer 2 — Push alert (server, `alertBot.ts`)

When auto-reconnect fails, `sendAlert('Telegram session expired …', 'auth-key-unregistered')` fires (5-min dedup). The message includes the remediation command.

### Layer 3 — In-app banner (client)

`TelegramSessionBanner` (`src/client/components/Layout/TelegramSessionBanner.tsx`) is placed in `AppLayout` directly below `AppHeader`:

```tsx
<AppHeader />
<TelegramSessionBanner />   {/* null unless sessionExpired */}
```

- Uses `useHealthStatus()` from `src/client/api/health.ts` — polls `GET /api/health` every **60 s** via TanStack Query
- Health response shape: `{ status, db, telegram: { circuit, sessionExpired } }`
- Renders `<Alert type="error" banner showIcon>` with i18n key `header.session_expired_banner` only when `data.telegram.sessionExpired === true`
- Disappears automatically once `sessionExpired` goes back to `false` (e.g. after redeploy)

---
