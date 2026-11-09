# VK Music Discovery product requirements

**Product scope is confirmed; provider feasibility remains blocked. This format conversion does not start runtime work or authorize provider calls, publication or deployment.**

Converted from YAML to Markdown on 2026-11-09 at the owner's request. Original decisions, authorization boundaries and observation dates are preserved.

| Field                 | Value                                      |
| --------------------- | ------------------------------------------ |
| Product name          | VK Music Discovery                         |
| Working name          | music-discovery                            |
| Status                | confirmed_product_scope                    |
| Created               | 2026-09-30                                 |
| Updated               | 2026-10-05                                 |
| Implementation status | blocked_on_provider_feasibility_no_runtime |
| Owner                 | apps/music-discovery                       |
| App directory         | apps/music-discovery                       |
| Implementation plan   | [implementation.md](implementation.md)     |

## Problem

Discover unfamiliar music from selected VK communities at the owner's own pace, without browsing every wall or retrieving region-blocked audio. Turn each useful post into a Spotify destination, keep unresolved posts available for manual review, and let the owner finish a finite queue without unread pressure. A permanent human-readable activity journal supports remembering previous discoveries and listening.

## Audience

| Field   | Value                                                                                        |
| ------- | -------------------------------------------------------------------------------------------- |
| Users   | One owner initially; no registration, sharing or roles.                                      |
| Devices | Desktop and mobile are equally important.                                                    |
| Usage   | Refresh on demand after days or weeks away, then explore or clear the resulting music queue. |

### Expected scale

| Field       | Value                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Communities | Approximately 30, not a product limit.                                                                     |
| Posts       | Approximately 10-20 per day across all communities, with potentially larger bursts and historical imports. |

### Authentication

- Own app-local account with the owner's familiar news login/password, provisioned deliberately.
- Reuse authentication mechanics, not news users, password hashes, sessions or database access.
- Hosting under one domain does not imply SSO; isolate cookies and app authorization.
- Do not publish the owner's email, password, tokens or existing account data in plans or fixtures.

## Scope

### First version

- Independent app using shared browser/auth mechanics where suitable.
- Public VK community walls through permitted API access.
- Flat source-management dialog with per-source initial dates and later explicit historical backfill.
- Manual end-to-end refresh with progress, durable intermediate results and per-source failures.
- Azure AI recognition from VK text and permitted supporting metadata.
- Spotify automatic matching and manual link repair for the CZ market.
- Both cover grid and compact list, plus VK-style review posts.
- Explicit listened/remove actions, bulk operations and permanent activity journal.
- Album-level duplicate suppression, real card deletion and journal-based six-month rediscovery.

### Later

- Bandcamp and SoundCloud links, each with a deliberate provider adapter and access review.
- Discogs and Metal Archives metadata enrichment after permitted access is verified.
- Closed community walls where the owner is a member, after permissions and content-processing terms are verified.
- Rich genre/source/type filtering, full metadata editing and optional roles.

### Not planned

- Scheduled polling, live monitoring, opening-triggered refresh or backlog urgency.
- Unread counters, read/unread states, hidden-card states or source folders.
- VK audio downloads, scraping, playback, DRM or regional-restriction circumvention.
- Spotify playback control, embedded players, library writes or playlist synchronization.
- Automatic recovery of removed cards, a trash bin or permanent card archives.
- Continuous monitoring of edits to already processed VK posts.
- A generic ingestion/provider framework or shared app-domain database.
- Production hosting, cutover, publishing or SSO as part of this planning task.

## Vocabulary

| Field            | Value                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Source community | A selected VK community wall; not a folder or a music-provider destination.                                    |
| Source post      | One VK publication describing an album, single, playlist or set of tracks.                                     |
| Release          | The artist and musical work identified from a post; not necessarily a particular commercial edition.           |
| Edition          | A specific version of a release, such as an original, Deluxe or Remaster.                                      |
| Card             | An active music discovery with one retained source post and supported music links; deleted on closure.         |
| Music link       | A provider-specific music destination; only Spotify is supported in the first version.                         |
| Needs review     | One user-facing section for music without a confirmed link, with distinct underlying reasons.                  |
| Listened         | An explicit owner assertion, never inferred from opening a link.                                               |
| Closure          | Either listened-and-remove or remove-without-listened; both permanently delete the card.                       |
| Journal          | Permanent user-friendly action history, grouped and searchable by artist and release, not an archive of cards. |
| Rediscovery      | A new independent card from a later source post after the repeat-suppression interval.                         |
| Refresh          | One user-triggered run covering ingestion, recognition and matching with visible stages and results.           |
| Source receipt   | Minimal source identity/processing evidence preventing the same VK post from being processed again.            |

## User stories

### US-01

| Field | Value                                                                                      |
| ----- | ------------------------------------------------------------------------------------------ |
| Owner | apps/music-discovery                                                                       |
| Goal  | Enter the personal app with familiar credentials without coupling it to the news database. |

#### Acceptance

- [ ] Independent app account/session works; news login, cookies and runtime data are unaffected.

### US-02

| Field | Value                                                                                        |
| ----- | -------------------------------------------------------------------------------------------- |
| Owner | apps/music-discovery                                                                         |
| Goal  | Add a community with a start date and stop following it without losing existing discoveries. |

#### Acceptance

- [ ] A flat dialog supports add/remove and an inclusive per-source date, defaulting to the last 30 days.
- [ ] Source removal preserves cards, their original attribution and journal entries.

### US-03

| Field | Value                                                                                |
| ----- | ------------------------------------------------------------------------------------ |
| Owner | apps/music-discovery                                                                 |
| Goal  | Catch up on all posts since the previous successful import with one explicit action. |

#### Acceptance

- [ ] Progress names fetching, recognition and matching stages; a week away does not lose intervening posts.
- [ ] Repeated pages, retries and interruptions neither duplicate cards nor skip pending work.
- [ ] A run can continue while the page is closed and its status can be inspected on return.

### US-04

| Field | Value                                                                           |
| ----- | ------------------------------------------------------------------------------- |
| Owner | apps/music-discovery                                                            |
| Goal  | Obtain a useful music link from differently formatted VK music recommendations. |

#### Acceptance

- [ ] Azure extraction handles representative formats without requiring restricted audio or playlist access.
- [ ] Exact Spotify matches precede allowed Deluxe/Remaster fallbacks; unsupported guesses require review.
- [ ] Missing optional year/genre does not prevent matching; model guesses are not presented as facts.

### US-05

| Field | Value                                                                            |
| ----- | -------------------------------------------------------------------------------- |
| Owner | apps/music-discovery                                                             |
| Goal  | Read an unresolved VK post and resolve it by supplying the correct Spotify link. |

#### Acceptance

- [ ] A single review section exposes the source and reason, including provider failures separately from no result.
- [ ] A valid manual link moves the card to music even when automatic extraction was incomplete.
- [ ] Manual replacement is available on resolved cards and survives refresh.

### US-06

| Field | Value                                                                       |
| ----- | --------------------------------------------------------------------------- |
| Owner | apps/music-discovery                                                        |
| Goal  | Browse music comfortably on phone and desktop without a news-feed workflow. |

#### Acceptance

- [ ] Both grid and list support covers, labels, search, four sorts, source expansion and music navigation.
- [ ] Navigation preserves queue position and does not close the card or claim playback.

### US-07

| Field | Value                                                                        |
| ----- | ---------------------------------------------------------------------------- |
| Owner | apps/music-discovery                                                         |
| Goal  | Permanently clear listened or unwanted discoveries, individually or in bulk. |

#### Acceptance

- [ ] Listened-and-remove and remove record different actions and delete the active card.
- [ ] Bulk selection across a filtered result set requires explicit scope and a count before confirmation.

### US-08

| Field | Value                                                                  |
| ----- | ---------------------------------------------------------------------- |
| Owner | apps/music-discovery                                                   |
| Goal  | Remember what happened to an artist/album without retaining old cards. |

#### Acceptance

- [ ] Journal events survive closure, can be grouped and filtered by artist/album and retain useful source/user labels and links.
- [ ] Opening a link is recorded as navigation, not listening; refresh has a human-readable outcome.

### US-09

| Field | Value                                                                                |
| ----- | ------------------------------------------------------------------------------------ |
| Owner | apps/music-discovery                                                                 |
| Goal  | Ignore cross-community repeats but rediscover an album after enough time has passed. |

#### Acceptance

- [ ] An active matching card always blocks another; ignored duplicate post content is not retained.
- [ ] After closure, only a new post published at least six calendar months later may create a new card.
- [ ] Ignored repeats and old-post reimports do not move the boundary or revive a card.

### US-10

| Field | Value                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------- |
| Owner | apps/music-discovery                                                                              |
| Goal  | Recover from provider outages without reprocessing all unresolved music or losing manual choices. |

#### Acceptance

- [ ] Retryable failures resume from their failed stage on an explicit refresh, preserving completed stages.
- [ ] Successful unrecognized/not-found outcomes are terminal until an explicit retry or manual repair.

## Requirements

### Sources and history

#### Examples

- https://vk.ru/e_music_postpunk
- https://vk.ru/atmosphericblackmetal
- https://vk.ru/music_doom

#### Behavior

- Normalize supported VK community links/identifiers and reject duplicate source configuration.
- Store each source's initial inclusive post-publication date; do not interpret it as album release year.
- Default to the last 30 days, allow a user-chosen date and explicit later backfill of older periods.
- Removing a source deletes its configuration, not its existing cards or journal attribution.
- Retain minimal processed-post identities across remove/re-add so it does not revive previously processed posts.
- No folders, community sidebar hierarchy, source exclusion keywords or read counters.

### Refresh

#### Stages

- fetching
- recognizing
- matching
- completed

#### Behavior

- One button initiates all configured sources plus eligible failed-stage retries.
- Provide stage descriptions, processed counts and partial failures; totals can be unknown while fetching.
- Persist fetched work before advancing ingestion progress; recognition/matching are separate checkpoints.
- Do not derive fetch progress from surviving cards, their maximum date or journal closure dates.
- Handle pinned posts, overlapping pages, concurrent arrivals and restarts without skipping history.
- Concurrent clicks or tabs must join/reject the existing run explicitly, not create overlapping ingestion.
- A bounded run can continue server-side after page navigation; this is not scheduled polling.
- Persist successful upstream stages and manual decisions before retrying a later provider stage.
- Summarize new music, review results, ignored repeats/non-music and failures without per-repeat journal noise.

### Extraction

| Field | Value                                                                                     |
| ----- | ----------------------------------------------------------------------------------------- |
| Input | VK post text first; permitted attachment metadata may corroborate it but is not required. |

#### Output

- Whether the post recommends music, is confidently non-music, or is uncertain.
- Source-backed artist, title, release type, original year and genre/style labels when available.
- Evidence and uncertainty sufficient to distinguish a real extraction from model speculation.

#### Rules

- One post produces at most one discovery; never fan attached tracks out into separate cards.
- A playlist or track collection illustrating one album is treated as that album.
- A collection that cannot be identified as one intended music item remains a VK-style review post.
- Albums, EPs, singles and explicitly recommended standalone tracks may resolve to their corresponding Spotify item.
- Confidently non-music posts stay out of the queue; uncertain classification stays visible for review.
- Do not fill missing dates/genres from model memory; optional metadata never blocks a valid music link.
- Treat post text as untrusted input, validate structured output and do not execute instructions contained in posts.
- Do not send Spotify metadata, candidate results or artwork to the model.

### Matching

| Field    | Value   |
| -------- | ------- |
| Provider | spotify |
| Market   | CZ      |

#### Priority

- Prefer an unambiguous same-artist, same-album match with the original year when the source supplies it.
- If exact matching fails, allow an identifiable Deluxe or Remaster of that same album, including its changed edition year.
- Otherwise require review; do not broaden to unrelated live versions, re-recordings, compilations or a first search hit.

#### Safeguards

- Search ranking is not proof of identity; evaluate returned candidates using deterministic application rules.
- A missing year does not preclude an otherwise unambiguous artist/title match; ambiguity remains reviewable.
- Keep source-original year and matched-edition year separate; never replace one silently with the other.
- Allowed edition fallback does not mean all albums with similar titles are duplicates.
- Use source evidence and supported identifiers to reconcile allowed editions; uncertain identities are not auto-merged.
- A Spotify URL or search result is not a guarantee of availability/playback for a device or account.
- Preserve the original VK link even for successfully matched cards.

### Manual links

#### Behavior

- Add or replace a Spotify music link on review and resolved cards; unsupported services are rejected clearly.
- Resolve supported album/track URLs to canonical provider identity, not arbitrary user-supplied fetch targets.
- A validated explicit user link is sufficient for a resolved card even if original extraction failed.
- Keep manual provenance and never overwrite an explicit link with automatic matching.
- Reconcile duplicate active cards on correction, preserving journal associations and the surviving card's useful data.
- Do not collect other VK reposts as provenance merely because a correction exposes a duplicate.

#### Implementation questions

- Choose the exact supported Spotify share-URL forms and safe redirect rules during the provider spike.
- Specify confirmation behavior when a manual correction identifies a recently closed album; never silently discard the user's edit.

### Duplicate and rediscovery

#### Identity

- Same VK post identity is idempotent forever, independently of release-level rediscovery.
- Match artist/release identity across active cards and journal evidence, not title alone or edition year alone.
- Store only minimal ingestion receipts for ignored posts, not their text, artwork, attachments or extra source links.
- An unidentifiable post can only be source-deduplicated until reliable release identity is available.

#### Ordered rules

- If the source post was already processed, do not create a new card.
- If the release has an active card, ignore the duplicate at any age without modifying the card or its sort date.
- Otherwise find the latest listened/remove closure for that release in the journal.
- With no previous closure, the eligible post may create a card.
- With a previous closure, require the new post's publication time to be at or after closure plus six calendar months.
- Create a new independent card when eligible; do not restore or retain the previously deleted card.

#### Invariants

- Ignored repeats do not extend the suppression interval or generate individual journal events.
- Fetch time is not publication time; historical backfill cannot manufacture eligibility.
- No timer creates a card when six months elapse; a new eligible source post is required.
- Closing a rediscovered card establishes the latest closure for the next interval.
- Already active cards always take precedence over interval expiry.

### Closure

#### Actions

| Field               | Value                                                                         |
| ------------------- | ----------------------------------------------------------------------------- |
| Listened and remove | Record explicit listening and closure, then permanently delete the card.      |
| Remove              | Record closure without asserting listening, then permanently delete the card. |

#### Behavior

- No undo, trash, hidden state or restorable copy of the deleted card.
- Keep permitted journal facts and minimal ingestion receipts, not source-content/card archives.
- Card deletion and its journal event must be atomic and idempotent under repeated requests.
- An in-flight recognition/lookup must not recreate a card closed during that work.
- Bulk actions address selected cards or an explicitly confirmed current result set, not unseen unrelated cards.
- Freeze the confirmed target set so newly arriving cards are not silently included.

### Journal

| Field     | Value                                                                                 |
| --------- | ------------------------------------------------------------------------------------- |
| Retention | Permanent product history, distinct from technical logs and provider-response caches. |

#### Event types

- Refresh requested and its completed, partial or failed outcome.
- Discovery created, including a later independent rediscovery.
- Music or source link opened through this application.
- Card explicitly listened-and-removed or removed without listening.
- Source added/removed and historical backfill requested.
- Manual link added/replaced and explicit processing retry requested.

#### Content

- Timestamp, action and understandable outcome, not stack traces or provider payloads.
- Artist/release identifiers and labels from VK or user-supplied information where available.
- Original VK/music links where permitted and necessary; no full image/card/source-post snapshots.
- Album associations for bulk actions so every affected album's history remains discoverable.
- Unknown-identity source events remain accessible and can be associated after reliable manual resolution.

#### Interface

- Chronological user-friendly view with artist/album grouping, search and filtering.
- Album groups collect actions across independent discoveries without retaining old cards; global refresh events remain visible separately.
- Show previous listened/removed dates for a later discovery without restoring old cards.
- A link-open event means the application initiated navigation, not that Spotify launched or playback occurred.

#### Guarantees

- Removing a card or source does not cascade-delete journal facts.
- Replayed jobs or closure requests do not multiply the same action event.
- Repeat suppression consults durable journal identity/closure facts rather than archived cards.
- Permanent user-action history does not authorize indefinite retention of external-provider content.

### Interface

| Field             | Value                                             |
| ----------------- | ------------------------------------------------- |
| Source management | Flat list in a dialog, not a folder/channel tree. |

#### Primary sections

- music
- needs_review
- journal

#### Music views

- cover_grid
- compact_list

#### Card

- Cover, artist, title and available year/genre.
- Open Spotify, listened-and-remove and remove actions.
- Expand the original VK source text and link.
- Prefer permitted Spotify artwork, otherwise a suitable available VK cover, otherwise a placeholder.
- Missing artwork or metadata must not block navigation or closure.

#### Review

- VK-like text/images, visible reason, original VK link, add-link and applicable explicit retry actions.
- No VK audio player; a playlist attachment is not a playback requirement.

#### Sorting

| Field              | Value                                     |
| ------------------ | ----------------------------------------- |
| Default            | source_post_date_descending               |
| Remember choice    | true                                      |
| Unknown year       | Last in either direction.                 |
| Duplicate behavior | Never bump an existing card for a repost. |

##### Fields

- source_post_date
- artist
- title
- original_release_year

##### Directions

- ascending
- descending

#### Filtering

- Text search by artist/title.
- Music versus needs-review section selection.
- Additional metadata filters are lower-priority follow-up work, not first-version acceptance.

#### Navigation

- Aim to open the Spotify application through supported item navigation; preserve a usable web fallback.
- Existing Spotify session belongs to Spotify, not this application.
- Do not promise native launch or autoplay; OS/browser choices can override the destination.
- Preserve queue position, view and sort on return; link opening never closes the card.

## Feasibility gates

| Field      | Value                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | Documentation research only; no account setup, live authenticated API calls or provider approval.                                                          |
| Researched | 2026-10-05                                                                                                                                                 |
| Decision   | Integrated live pilot blocked on VK transfer permission, Spotify policy applicability and unverified app access; see implementation.md execution evidence. |
| Stop rule  | If access or permitted use is blocked, record the blocker and revisit scope with the owner; do not silently substitute another service.                    |

### Vk

| Field           | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| Documented path | Service-token wall.get/groups.getById is a candidate for public community access. |

#### Unverified

- Whether the intended new app credentials can read all three representative walls.
- Actual permitted text/photo/attachment fields, pagination, rate limits and account/region behavior.
- Current wall.get token compatibility; the latest method-page retrieval did not expose usable documentation to reconfirm earlier findings.

#### Constraints

- Public visibility does not establish anonymous API access.
- Earlier documentation research reported offset/count pagination rather than a date-range filter; reconfirm before implementation.
- VK Platform Rules section 2.4 explicitly restricts transfer-related uses of wall.get data without direct VK consent; sending public post text to Azure is not cleared.
- Closed communities need separately verified member identity and permissions; not first-version scope.

#### References

- https://dev.vk.com/ru/rules
- https://dev.vk.com/ru/method/wall.get
- https://dev.vk.com/ru/method/groups.getById
- https://dev.vk.com/ru/api/access-token/service-token
- https://dev.vk.com/ru/api/access-token/user-token
- https://dev.vk.com/ru/reference/objects/post

### Spotify

| Field             | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Documented path   | Server-side Client Credentials for catalog search, not end-user OAuth or playback permissions. |
| Confirmed by user | Owner has Premium; target account market is Czechia.                                           |

#### Unverified

- Actual developer app access, current account quotas and successful CZ album/track searches.
- Applicability of cross-service integration/content-analysis restrictions to this non-streaming VK discovery workflow.
- Exact permitted persistent link/identity fields and provider-cache retention for the journal design.

#### Constraints

- Development Mode requires the app owner to maintain Premium; opening Spotify and API authorization are distinct.
- Developer Policy III.14 prohibits feeding Spotify content into AI, not merely using it for training.
- Policy III.5 cross-service and III.13 content-analysis restrictions require clarification before implementation.
- Observe artwork attribution, linking, display and cache rules; technical lookup success is not policy approval.

#### References

- https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow
- https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- https://developer.spotify.com/documentation/web-api/reference/search
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- https://developer.spotify.com/documentation/web-api/concepts/spotify-uris-ids
- https://developer.spotify.com/policy
- https://developer.spotify.com/terms
- https://developer.spotify.com/documentation/design

### Azure

| Field       | Value                                                          |
| ----------- | -------------------------------------------------------------- |
| User report | An existing small-model deployment is available for this work. |

#### Unverified

- Exact deployment/model identifier, endpoint, API version, credentials, quota and expected cost.
- Permitted processing of the selected VK content and representative extraction quality.

#### Constraints

- Use server-owned configuration; do not infer a real model ID from the informal interview label.
- Agree bounded requests/retries and cost visibility before large backfills; no guessed monthly budget.

### Enrichment

| Field                      | Value                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Required for first version | false                                                                                                         |
| Discogs                    | Official developer/terms pages returned HTTP 403 to research tools; access and usage terms remain unverified. |
| Metal archives             | Official pages returned HTTP 403; no approved public API was located, which is not proof none exists.         |

#### Constraints

- Do not replace inaccessible documentation with scraping, unofficial wrappers or assumed permission.
- Do not assume catalog data may be sent to AI or retained indefinitely.

#### Attempted references

- https://www.discogs.com/developers
- https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use
- https://www.metal-archives.com/content/faq
- https://www.metal-archives.com/content/rules

## Implementation boundaries

- App owns source configuration, cards, receipts, journal, schema, migrations, provider adapters and credentials.
- packages/browser and packages/auth-server may supply reusable mechanics; no shared-runtime imports from apps.
- News is a UX/reference implementation, not a reusable Telegram database or domain service.
- Provider content caches are separate from permanent user-action facts and are evictable under provider rules.
- Minimal receipt/index data is not a hidden card archive; release matching does not require a permanent catalog entity.
- Re-check journal eligibility at card creation so concurrent sources or late worker results cannot resurrect closed cards.
- Reuse existing workspace tooling and fixtures; no production data or real provider credentials in automated tests.

## Implementation choices to resolve

| Field          | Value                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Interpretation | Engineering decisions within the confirmed scope, not silently completed work or extra product promises. |

### Items

- Choose and test the timezone for inclusive dates and six-calendar-month arithmetic; Europe/Prague is the proposed default.
- Define month-end clamping, leap-day boundaries and deterministic page ordering before implementing rediscovery.
- Agree concrete match evidence/thresholds from representative posts, especially absent years and same-name artists.
- Select allowed Spotify URL forms, edition identity mappings and journal identity fields after policy review.
- Decide exact manual-correction conflict confirmation, provider-outage validation and supported primary-link behavior.
- Choose SQLite/storage layout, job persistence, app-specific ports/cookies and same-domain routing without inheriting news infrastructure.
- Establish provider timeout, retry, batching, backfill cost and rate-limit settings from verified quotas.

## Test strategy

| Field           | Value                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Approach        | Demonstrate each story through existing repository test tools using disposable fixtures and provider substitutes. |
| Acceptance rule | Provider documentation, a build or a plan alone does not establish live feasibility or product completion.        |

### Focus

- Inclusive source dates, pinned/overlapping pages, week-long catch-up and interrupted runs.
- AI schema validation, uncertain/non-music posts, collections, absent year/genre and malicious post instructions.
- Exact-before-edition matching, wrong artists, changed remaster years and CZ availability.
- Manual link correction, unsupported URLs, safe redirect validation and immunity to automatic overwrite.
- Active-card duplicate suppression, unknown-identity posts and concurrent same-album arrivals.
- Six calendar months before/at/after the boundary, month ends, no-closure cases and historical backfill.
- Permanent journal with real card/content deletion, latest closure selection and idempotent bulk actions.
- Provider outage versus successful no-result, rate limits and reuse of persisted successful stages.
- Phone/desktop grid/list, sorting, source/review rendering, empty states and return navigation.
- Independent auth/cookies, untrusted content rendering, secret redaction and provider-content retention.

## Provenance

| Field          | Value                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| Session title  | VK API и интеграция музыки                                                            |
| Session id     | 4e4c72a1-e2b1-4a81-afd8-8dae3ab3c35c                                                  |
| Original basis | Initial short proposal; incomplete assistant history was not implementation evidence. |

### Revision

| Field      | Value                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Session id | 9a2bd5ca-029a-4538-b774-98500565ec6e                                                                    |
| Confirmed  | 2026-10-05                                                                                              |
| Basis      | User confirmed the consolidated model after questions Q1-Q39 and an explicit card-lifecycle correction. |
| Limit      | Approval covers local requirements and planning, not code, credentials, publication or deployment.      |

#### Supersedes

- Viewed/read/unread state and counters.
- Keeping every duplicate VK post as additional album provenance.
- Permanent archived cards or restoring a deleted card.
- Arbitrary manually supplied music-provider URLs in the first version.
- Requiring complete year/genre metadata before a useful music link.

### Execution authorization

| Field | Value                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| Date  | 2026-10-05                                                                                                                       |
| Basis | Owner subsequently requested implementation; begin with provider-feasibility.                                                    |
| Limit | Local work only; provider configuration and bounded live calls need explicit inputs, and publication/deployment remain separate. |

## Processing model

| Field  | Value                                                                     |
| ------ | ------------------------------------------------------------------------- |
| Status | Proposed implementation vocabulary for the confirmed observable behavior. |

### Independent dimensions

#### Extraction

- pending
- identified
- unrecognized
- non_music
- failed

#### Matching

- not_started
- matched
- ambiguous
- not_found
- failed

#### Link origin

- none
- automatic
- manual

#### Refresh run

- queued
- running
- completed
- partial
- failed

### Rules

- Successful music with a confirmed supported link appears in music, including manually resolved extraction failures.
- Unrecognized, ambiguous and not_found share the review section but retain different reasons.
- Provider failure exposes service/stage and retry eligibility, never masquerades as no match.
- Retry transient failures within bounded provider guidance or on the next user refresh; no autonomous polling.
- Invalid credentials, permissions or exhausted budgets require explicit attention, not endless retries.
- Successfully unrecognized/not_found results stay terminal on ordinary refresh until an explicit user retry.
- Non-music outcomes retain only necessary processing receipts, not cards.
- Queue presence, journal actions and ingestion progress are not read/unread state.
