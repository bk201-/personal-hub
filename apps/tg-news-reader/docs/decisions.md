# TG News Reader — Decisions & History

> Archive of architectural decisions and resolved bugs. Explains the _why_, not just the _what_.

---

## Architectural decisions

### Auth: manual implementation vs better-auth

Chose **manual** (bcryptjs + hono/jwt + otpauth):

- Simple use case: single user, single server
- No dependency on an external library with its own update cycle
- Revisit if OAuth (Google/GitHub) or Passkeys are added

### DB: SQLite/Turso vs PostgreSQL

SQLite locally, Turso (libSQL) in production — via a single `@libsql/client`:

- `db/index.ts` reads `DATABASE_URL`: if set → Turso, otherwise `file:data/db.sqlite`
- Minimal infrastructure, no separate DB server
- Bottleneck: write concurrency — not relevant for a single-user app

### count-unread: lastFetchedAt vs lastReadAt

`count-unread` intentionally uses `lastFetchedAt` (not `lastReadAt`):

- Badge = `unreadCount` from channel list query
- Using `lastReadAt` would double-count already-fetched unread messages
- `getSinceDate` is used only in the fetch route

### Scale-to-zero cooldown

2026-03-28: increased from 300s to **1800s** (30 minutes):

- Reason: frequent false alerts from `RestartCount` when the container woke from zero
- Alongside: `tg-reader-restart` alert changed to `RestartCount > 1` over 15 min
- API note: PATCH via `2024-10-02-preview` (stable API did not accept `cooldownPeriod` as writable)

---

## Resolved bugs (historical log)

### Mark all as Read — 2 bugs

**Symptom**: after "Mark all as read" + refresh, badges remained and items weren't marked.

**Bug 1**: `useMarkAllRead.onSuccess` did not properly invalidate the channel list query.  
**Fix**: ensure `invalidateQueries` fires for channel list on mark-all-read success.

**Bug 2**: fetch route deletes `isRead=1` items before fetching new ones; `/read-all` did not update `lastReadAt` → after deletion, the server re-fetched them from Telegram with `isRead=0`.  
**Fix**: in `/read-all`, update `lastReadAt = max(news.postedAt)` for the channel.

### Double unread counter

`count-unread` mistakenly used `lastReadAt` → fixed to use `lastFetchedAt` (see decision above).

### markRead without channelId

`markRead.mutate` wasn't passing `channelId` — bug in `useNewsHotkeys`. Fixed.

### Tag-filter navigation

`useEffect` in `NewsFeed` was finding the first unread globally instead of the next one after the current position. Fixed: search AFTER current, fallback to first globally.

### TG_SESSION leaked in chat

Session rotated via `npm run tg:auth`; old session terminated manually in Telegram → Settings → Active Sessions.

---

## Technical debt (completed)

- [x] `applyFilters` moved to server (server-side filtering via `json_each()`)
- [x] `getSinceDate` extracted to shared helper (`channels.ts`)
- [x] `getChannelInfo` — auto-fill name/description when adding a channel (`GET /api/channels/lookup`)
- [x] `GroupPanel` split into `GroupItem` + `GroupFormModal` + `GroupPinModal`
- [x] SW media cache: Cache-First for `/api/media/*`, strips `?token=`, 2000 entries / 30-day TTL
- [x] Structured logging: pino-pretty in dev, JSON in prod; access-log; rate-limit hits; uncaughtException/unhandledRejection
- [x] Localization: English default, Russian fallback; SVG flags; language switcher in header
- [x] Download manager: `downloads` table + workers; SSE progress; DownloadsPanel + DownloadsPinnedContent
- [x] Accordion mode: `newsViewMode` persisted; NewsAccordionList + NewsAccordionItem; mobile always accordion
- [x] Adaptive layout: Splitter on xxl only; Drawer on < xxl; DownloadsPanel pinned on xxl only
- [x] Monitoring: alertBot; Azure Monitor KQL + Metric alerts; smoke test in CI; Telegram failure notification
- [x] Accessibility: role/aria/tabIndex/onKeyDown; nav+listbox on containers; focus-ring; MaybeTooltip
- [x] Instant View: parse `cachedPage.blocks` via `richTextToString`; stored in `news.fullContent` on INSERT
- [x] media_content auto-filter: `mediaType IN ('photo','document')`; text-only hidden, visible via "Show all"
- [x] Audio messages: `mediaType='audio'`; auto-download disabled; `<audio controls>` when file is downloaded
- [x] Pull-to-refresh: `usePullToRefresh` vanilla touch hook; non-passive touchmove; direct DOM mutations; DAMPEN=0.55; `NewsAccordionList`
- [x] Mobile compact toolbar: `NewsDetailToolbar` inline variant — checkbox + ✓ + ⋯ dropdown; mirrors `NewsListItem` layout exactly
- [x] `NewsHashtags.tsx`: shared component with `e.stopPropagation()`; passed through accordion → detail → toolbar
- [x] Sticky accordion header: `position: sticky; top: 0; z-index: 10`
- [x] Filters 80+: `Set<string>` for tags O(T) instead of O(F×T); pagination at 20 rows
- [x] Channel duplicate check: telegramId normalization on blur → compare with allChannels; 409 fallback
