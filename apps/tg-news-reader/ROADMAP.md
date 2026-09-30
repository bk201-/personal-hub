# TG News Reader — Roadmap

> Date: April 2026  
> Living document — revisit when planning each step.  
> Implementation details: [docs/architecture.md](docs/architecture.md) · Decisions & history: [docs/decisions.md](docs/decisions.md) · Azure ops: [docs/azure.md](docs/azure.md) · Git workflow: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Technical Debt

| #   | Task           | Description                                                                                                                                               | Complexity |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | E2E smoke test | Login → select channel → fetch → read news → mark read. Stack: **Playwright**, runs against `npm run dev` with a test SQLite DB seeded with fixture data. | ⭐⭐⭐⭐   |

---

## Deferred (low priority)

| #   | Task                       | Description                                                                                                                                                                                                                                                              | Complexity |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | Post search                | Search input in toolbar — client-side filter by `text` + `fullContent`. For large channels consider SQLite FTS5 on the server. Low urgency: hashtag filter covers most use cases.                                                                                        | ⭐⭐       |
| 2   | Mobile swipe gestures      | Swipe-to-mark-read on news list items, swipe between album photos. Needs UX design first: whole row vs header, conflict with scroll. Consider `react-swipeable` or native touch events.                                                                                  | ⭐⭐⭐     |
| 3   | Client-side video download | Videos already render in the browser — save to disk via `<a download>` without storing a copy in Azure. Useful for large videos to watch offline. **Superseded by the [Export channel media to a local folder](#rfc-export-channel-media-to-a-local-folder) RFC below.** | ⭐⭐       |
| 4   | Invites / multi-user       | Invite another user via an invite link. Requires: user profile card, password change, roles. Not relevant while single-user. See Open Question #2.                                                                                                                       | ⭐⭐⭐⭐   |

---

## RFC: Export channel media to a local folder

> Status: **Proposed** · Complexity: ⭐⭐⭐ · Supersedes Deferred #3, resolves part of Open Question #1

### Goal

Let the user pick a local folder (e.g. on Windows) and bulk-export a channel's media
**straight to that folder**, without persisting a copy in the server's `data/` directory
(container disk / Azure). Already-downloaded files are reused, and every successfully
written item is marked as read.

### Key architectural insight — the server stays in the loop as a streaming proxy

The Telegram session (`TG_SESSION`) lives **only on the server** (gramjs). The browser
cannot fetch media from Telegram directly. So "stream to a folder instead of Azure" really
means:

```
Telegram → server (gramjs, existing session) → HTTP response (chunked, NOT written to data/)
         → browser → FileSystemWritableFileStream → user-picked folder
```

The win is **not** "client talks to Telegram" — it's that the server stops being a
**store** and becomes a **passthrough**:

- no copy in `data/` (container disk / Azure)
- **size limits drop away** — `MAX_PHOTO/VIDEO/IMG_DOC_SIZE_BYTES` exist only to protect the
  server disk; with passthrough they no longer apply
- large videos go straight to the user's disk without buffering on the server

### Client side — File System Access API

- `window.showDirectoryPicker()` → `FileSystemDirectoryHandle` with write permission.
- ⚠️ **Chromium desktop only** (Chrome/Edge on Windows/macOS/Linux). Not in Firefox/Safari,
  not on mobile. Feature-detect via `'showDirectoryPicker' in window`; otherwise fall back to
  per-file `<a download>` (the original Deferred #3 behaviour).
- Persist the chosen handle in IndexedDB and re-validate with
  `queryPermission` / `requestPermission` so the folder isn't re-picked every session.
- Per file: `dirHandle.getFileHandle(name, { create: true })` →
  `handle.createWritable()` → pipe the response body to it (honour backpressure with `await`).

### "Reuse if already downloaded" — two levels

1. **Server already has the file** (`news.localMediaPath` / `localMediaPaths` set) → stream
   from disk via the existing `/api/media/...` path, **no Telegram call** (fast, no
   FloodWait / circuit-breaker pressure).
2. **File already present in the target folder** (same name + size) → skip the write. Gives
   idempotency and "resume an interrupted export".

### Mark-as-read

After each file is fully written, call the existing mark-read flow — **only on success**.
Cancelling mid-export leaves partial progress, which is fine. Match the current local-vs-
Telegram read semantics already used by the app.

### Server side — new streaming endpoint

- New route, e.g. `GET /api/news/:id/media-stream` (JWT-protected; plain `fetch` can send
  `Authorization: Bearer`, so no `?token=` needed).
- If `localMediaPath` is set → `createReadStream` the existing file (reuse the Range-capable
  logic in `media.ts`).
- Otherwise → download from Telegram **without** `outputFile`: use `tg.iterDownload(...)` to
  pull chunks and pipe them to the HTTP response. **Do not** buffer the whole file in memory
  (critical for large videos). Wrap the Telegram call in `telegramCircuit`.
- Bypass the size limits in `downloadMessageMedia` for this passthrough path.

### Bulk export flow

"Export channel to folder" enqueues every news item that has media. Process **sequentially**
to respect Telegram rate limits / circuit breaker. Could reuse the download-manager pattern,
but with the _sink_ being the client folder instead of `data/`. Surface progress via a
client-side counter or a dedicated SSE stream. Albums = multiple files per news item.

### Open sub-questions

- Filename scheme: `{msgId}.{ext}` vs `{date}_{msgId}_{originalName}` (albums need a suffix).
- Should bulk export also push read state to Telegram (`readChannelHistory`) or only mark
  read locally? Match existing behaviour.
- Progress UX: reuse `DownloadsPanel` or a dedicated export modal with a progress bar.

### Compression & framing — considered & rejected

Should the export stream be compressed (gzip/zstd/brotli), wrapped in protobuf, or bundled
into a streaming archive? Mostly no — recorded here so we don't revisit it:

- **Compressing the media bytes → counterproductive.** The payload is already-compressed
  formats (JPEG, MP4/WebM, MP3/OGG, WebP). gzip/zstd/brotli on top yields ~0–2% while burning
  CPU on both the proxy and the browser, and it breaks HTTP Range / video seeking. If transport
  compression is ever wanted, that's `Content-Encoding` handled by the platform — not hand-rolled.
- **Protobuf → not applicable.** Protobuf serializes _structured data_; here the structured
  part (news metadata: id, text, links) is negligible next to multi-MB media blobs, and is
  already served as JSON by the existing API. Framing binary blobs in protobuf buys nothing.
- **Streaming archive (ZIP/tar) → wrong tool for the primary path, right tool for the fallback.**
  The whole point of the File System Access path is writing **individual real files** into the
  folder; bundling into one archive would lose per-file resume, skip-existing dedup, per-file
  mark-as-read, and ready-to-open files. **However**, for the non-Chromium / mobile fallback
  (only a single `<a download>` is possible), a streaming **ZIP in `store` mode** (no
  compression — just concatenation + central directory, ~no CPU) is the natural way to grab a
  whole channel as one `channel.zip` without buffering. Candidates: `client-zip` (client,
  emits a `ReadableStream`) or `archiver` / `zip-stream` (server). This also collapses
  "many small files = many requests" (already a non-issue on HTTP/2).

### Phasing

1. **MVP** — single-item "Save to folder" button on a post/video (proves the passthrough
   stream + folder write + reuse).
2. **Bulk** — "Export channel to folder" with sequential queue + progress + mark-read.
3. **Polish** — persisted folder handle, skip-existing dedup, fallback for non-Chromium.

---

## RFC: Comment-thread media in the lightbox (media channels)

> Status: **Proposed** · Complexity: ⭐⭐⭐ · Scope: `media` channel type

### Goal

For `media` channels, a post often has a linked **discussion (comments) thread** whose
replies contain **additional images/videos**. Mirror the Telegram app behaviour: when the
user opens the lightbox on a post, the image flow should also include the media posted in
that post's comments — so scrolling through the lightbox walks the post's own album **and**
the comment images, seamlessly.

### Telegram model (how comments work)

- A channel can have a **linked discussion group**. A channel post's "comments" are replies
  to that post inside the linked group.
- On the raw message, `msg.replies` carries the thread info:
  `replies.comments === true` (it's a comment thread), `replies.replies` (count),
  `replies.channelId` (the linked discussion group).
- gramjs entry points:
  - `messages.GetDiscussionMessage({ peer, msgId })` → resolves the post to its discussion
    message in the linked group.
  - `messages.GetReplies({ peer: <discussionGroup>, msgId: <discussionMsgId>, ... })` (or
    `client.getMessages(group, { replyTo })`) → pages through the comment replies, each of
    which may carry `media` (photos, videos, albums).

### Detecting comments (cheap, eager)

`msg.replies` is already present on the messages we fetch — no extra Telegram call. At fetch
time, persist a couple of flags on the news row:

- `hasComments: boolean` (`replies?.comments === true`)
- `commentCount: number` (`replies?.replies ?? 0`)
- `discussionPeerId` / `discussionMsgId` — enough to fetch the thread later.

This lets the UI show a "has comments" indicator and gate the (expensive) media fetch.

### Fetching comment media — lazy, on demand

Eagerly pulling every post's comment thread at fetch time would multiply Telegram calls and
invite FloodWait. Match the app: **fetch on demand** — when the user opens the lightbox (or a
dedicated "comments media" action) on a post that `hasComments`. All calls go through
`telegramCircuit`, sequentially, with the existing retry/backoff.

### Storage

Comment media are **not** channel posts, so they should not become `news` rows. Options:

- **New side table** `comment_media (id, news_id → news ON DELETE CASCADE, comment_msg_id,
media_type, local_media_path, sort_order, created_at)`. Downloaded via the existing
  `downloadManager` (`enqueueTask`, new `type: 'comment_media'` or reuse `'media'` with a
  source descriptor). Size limits apply as for any background download.
- Alternative: transient passthrough (fetch + stream on demand, never persisted) — simpler but
  no caching and re-fetches every open. Persisting is preferred for the lightbox UX.

### Lightbox integration

`useLightboxNav` currently builds a flat list from news items with media and walks
album-images-then-items (`go` / `goToAlbumImage`). Extend it so a post's entry expands to:

```
[ post album image 1 … N ] + [ comment image 1 … M ]
```

navigable with the same flat logic. The `positionLabel` and album counters
(`albumExpectedLength`) must account for the appended comment images. Decide whether comment
images are a distinct visual segment (e.g. a divider / "from comments" badge in
`LightboxToolbar`) or fully merged.

### Concerns / open sub-questions

- **Cost & rate limits**: comment fetching adds Telegram load → strictly lazy, sequential,
  through `telegramCircuit`; consider a per-post cache TTL so re-opening doesn't refetch.
- **Pagination**: large threads can have hundreds of replies → page the `GetReplies` call and
  cap how many comment images are pulled (config, e.g. `COMMENT_MEDIA_MAX`).
- **Which media**: images + videos only (`photo` / `document` with image/video mime), skip
  stickers/voice. Reuse the `LIGHTBOX_MEDIA_TYPES` filter.
- **Scope**: `media` channels only for now; consider a per-channel toggle.
- **Ordering**: comment media by reply chronology (oldest → newest) after the post's own album.

### Phasing

1. **Detect** — persist `hasComments` / `commentCount` (+ discussion ids) at fetch time
   (cheap, no extra TG calls); show a "has comments" indicator.
2. **Fetch & store** — on-demand comment-media fetch through `telegramCircuit` +
   `downloadManager`, into a `comment_media` table (lazy, capped, cached).
3. **Lightbox** — merge comment images into `useLightboxNav` flow with correct counters and an
   optional "from comments" segment marker.
4. **Tests, i18n, version bump.**

---

## Open Questions

1. **gramjs in the browser**: should we share the main session or create a separate one?
   _Partly answered by the [Export to folder RFC](#rfc-export-channel-media-to-a-local-folder):
   the server acts as a streaming proxy, so gramjs is **not** needed in the browser._
2. **better-auth**: reconsider if we move to invites / OAuth (Google/GitHub) / Passkeys — not before there's a real need for multi-user.
