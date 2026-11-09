# TG News Reader proposed implementation slices

**Planning only. Every slice is not started; implementation, paid validation, publication and production activation need their respective authorization.**

| Field                 | Value                                        |
| --------------------- | -------------------------------------------- |
| Status                | planned_awaiting_execution_authorization     |
| Created               | 2026-11-06                                   |
| Plan updated          | 2026-11-06                                   |
| Converted to markdown | 2026-11-09                                   |
| Owner                 | `apps/tg-news-reader`                        |
| Prd                   | [Product requirements and interview](prd.md) |

## Authorization

| Field          | Value                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Current        | Save local plans and clarify requirements interactively; documentation-only publication authorized on 2026-11-09. |
| Implementation | Not authorized by this planning request.                                                                          |
| Azure changes  | Require separate authorization, including deployment creation and bounded paid inference.                         |
| Production     | Requires separate authorization; no change to existing deployment policy.                                         |
| Publication    | Owner authorized a documentation-only commit, push and PR on 2026-11-09; no runtime work is authorized.           |

## Delivery rules

- All slices are not_started; code observations in the PRD are baseline evidence, not completed planned work.
- Resolve each slice's decision gates before implementation; order below is not an implicit priority decision.
- Every slice belongs to apps/tg-news-reader and includes its own observable behavior, tests and related documentation.
- Use the existing app route/service/client tests and workspace scripts; no separate running app copies for model checks.
- Preserve app name/version, Telegram session ownership, read-state invariants and group/media authorization.
- Keep credentials and news payloads out of plans, patches, fixtures and logs.
- Do not combine model migration with prompt redesign, event clustering or changes to digest batch size.

## Priority and delivery tracks

| Field                  | Value                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Status                 | first_track_confirmed_remaining_unordered                                                                             |
| Question               | [Q14](prd.md#q14)                                                                                                     |
| Confirmed              | 2026-11-06                                                                                                            |
| Preferred first track  | luna-migration                                                                                                        |
| Preferred first slices | [luna-client](#luna-client) -> [luna-live-check](#luna-live-check) -> [luna-activation](#luna-activation)             |
| Remaining order        | The owner has not ranked filters, search/day navigation and digest grouping.                                          |
| Dependency rule        | Priority is a planning preference, not a cross-track technical dependency or implementation/production authorization. |

**Independent tracks:**

- Filters and lifecycle management.
- Search and day navigation within retained current-channel news.
- Digest-only game/topic grouping within the current digest.
- Luna migration, independent of the product grouping redesign.

## Slice index

| Track                          | Slice                                                 | Stories                                                       | Dependencies                                                                         | Status      |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- |
| First priority: Luna migration | [luna-client](#luna-client)                           | [US08](prd.md#us08)                                           | None                                                                                 | not_started |
| First priority: Luna migration | [luna-live-check](#luna-live-check)                   | [US08](prd.md#us08)                                           | [luna-client](#luna-client)                                                          | not_started |
| First priority: Luna migration | [luna-activation](#luna-activation)                   | [US08](prd.md#us08)                                           | [luna-live-check](#luna-live-check)                                                  | not_started |
| Filters and lifecycle          | [filter-statistics](#filter-statistics)               | [US02](prd.md#us02), [US03](prd.md#us03), [US05](prd.md#us05) | None                                                                                 | not_started |
| Filters and lifecycle          | [filter-editor](#filter-editor)                       | [US02](prd.md#us02), [US04](prd.md#us04)                      | [filter-statistics](#filter-statistics)                                              | not_started |
| Filters and lifecycle          | [bulk-filter-cleanup](#bulk-filter-cleanup)           | [US03](prd.md#us03)                                           | [filter-statistics](#filter-statistics), [filter-editor](#filter-editor)             | not_started |
| Filters and lifecycle          | [automatic-filter-cleanup](#automatic-filter-cleanup) | [US05](prd.md#us05)                                           | [filter-statistics](#filter-statistics), [bulk-filter-cleanup](#bulk-filter-cleanup) | not_started |
| Search and day navigation      | [retained-news-search](#retained-news-search)         | [US06](prd.md#us06)                                           | None                                                                                 | not_started |
| Search and day navigation      | [day-navigation](#day-navigation)                     | [US07](prd.md#us07)                                           | None                                                                                 | not_started |
| Digest quality                 | [ai-event-grouping](#ai-event-grouping)               | [US01](prd.md#us01)                                           | None                                                                                 | not_started |
| Deferred work                  | [semantic-news-search](#semantic-news-search)         | [US06](prd.md#us06)                                           | [retained-news-search](#retained-news-search)                                        | not_started |
| Deferred work                  | [month-navigation](#month-navigation)                 | [US07](prd.md#us07)                                           | [day-navigation](#day-navigation)                                                    | not_started |

## First priority: Luna migration

### luna-client

**Prepare compatible streaming generation and rollback**

| Field                      | Value                 |
| -------------------------- | --------------------- |
| Owner                      | `apps/tg-news-reader` |
| Status                     | not_started           |
| Stories                    | [US08](prd.md#us08)   |
| Depends on                 | None                  |
| Unresolved interview gates | None                  |

#### Work

- [ ] Move only the digest Azure client to the supported v1 Chat Completions endpoint.
- [ ] Use compatible Luna token/reasoning parameters; retain correct parameters for the old model and existing direct OpenAI configuration.
- [ ] Keep the current prompt, selected-news semantics, prefetch and batch contracts during this migration.
- [ ] Treat empty/refused/truncated/failed output explicitly, preserving the existing UI stream contract.
- [ ] Partition persisted batch results by generation configuration, including selection changes and rollback.
- [ ] Capture model identity, token/reasoning usage, finish reason and latency without news content or secrets.
- [ ] Document configuration and preserve the TTS client and deployment.

#### Done when

- [ ] Mocked old-model and Luna requests use accepted parameter shapes and keep citation/stream behavior.
- [ ] Generation failures are not cached or marked complete; no silent cross-provider fallback is introduced.
- [ ] Switching generation configuration cannot restore an old cached result as a new-model result.
- [ ] TTS behavior remains unchanged and rollback requires only a documented configuration selection.

#### Validation

- [ ] Existing openaiClient and digest route tests, client stream/batch persistence tests and TTS regression coverage.
- [ ] Stop, length, refusal/content-filter, empty text, missing usage, provider error and interrupted stream.
- [ ] Workspace tests, typecheck, lint, formatting and affected builds using existing scripts.

### luna-live-check

**Prove a bounded Luna digest on deliberately prepared inputs**

| Field                      | Value                       |
| -------------------------- | --------------------------- |
| Owner                      | `apps/tg-news-reader`       |
| Status                     | not_started                 |
| Stories                    | [US08](prd.md#us08)         |
| Depends on                 | [luna-client](#luna-client) |
| Unresolved interview gates | None                        |
| Latency target seconds     | 120                         |
| Latency batch max items    | 50                          |

#### Human decisions and approvals

- [ ] Authorize resource changes and a specific paid request/token/spend cap.
- [ ] Verify Global Standard quota/capacity on the existing Sweden Central resource and remaining subscription credit.

#### Work

- [ ] Create a separately named Global Standard Luna deployment in the existing resource; retain the old text and voice deployments.
- [ ] Use one bounded script and the existing server-owned credentials; no parallel app servers or Telegram clients.
- [ ] Exercise synthetic/permitted normal and gaming news, citations and article-enriched content.
- [ ] Choose reasoning and completion limits from visible quality, total usage and agreed latency rather than a public max-effort score.
- [ ] Measure complete uncached batches through the app's generation flow, including required article prefetch and excluding TTS; record model-only timings separately.

#### Done when

- [ ] Requests succeed with the selected Azure API/model and stay within the authorized validation cap.
- [ ] The control set has valid citations, no invented facts and no lost required details.
- [ ] Measured delay and total billable tokens meet the agreed budget or explicitly block activation.
- [ ] Representative uncached batches of up to 50 news items reach completed text within 120 seconds, including article prefetch and excluding TTS.

#### Validation

- [ ] Record redacted outcomes, selected generation settings and actual usage; retain no credentials/private payloads.
- [ ] Compare full request-to-completed-text timings against 120 seconds for representative batches with and without article prefetch; do not substitute first-chunk or cached timings.

**Stop if:** The selected Global Standard deployment is unavailable or acceptance cannot be met; do not silently switch geography/provider or exceed the authorized validation cap.

### luna-activation

**Activate the verified Luna configuration with a documented rollback**

| Field                      | Value                               |
| -------------------------- | ----------------------------------- |
| Owner                      | `apps/tg-news-reader`               |
| Status                     | not_started                         |
| Stories                    | [US08](prd.md#us08)                 |
| Depends on                 | [luna-live-check](#luna-live-check) |
| Unresolved interview gates | None                                |

#### Human decisions and approvals

- [ ] Separately authorize publication and production activation under the repository's existing gates.

#### Work

- [ ] Release the backward-compatible client before selecting the new deployment in production configuration.
- [ ] Confirm digest and unchanged TTS behavior without creating a second Telegram client.
- [ ] Observe failures, latency and usage; retain the old deployment until owner acceptance and its retirement limit.
- [ ] Roll back through configuration when acceptance fails, without pretending the fallback is Luna.

#### Done when

- [ ] The running digest reports the intended generation identity and meets the accepted control checks.
- [ ] TTS and ordinary news workflows remain functional.
- [ ] The rollback procedure is verified and owner acceptance is recorded before retiring the old deployment.

#### Validation

- [ ] Current CI/release checks, permitted production smoke checks and explicit generation/cache-identity verification.

## Filters and lifecycle

### filter-statistics

**Make filter usage and inactivity meaningful**

| Field                      | Value                                                         |
| -------------------------- | ------------------------------------------------------------- |
| Owner                      | `apps/tg-news-reader`                                         |
| Status                     | not_started                                                   |
| Stories                    | [US02](prd.md#us02), [US03](prd.md#us03), [US05](prd.md#us05) |
| Depends on                 | None                                                          |
| Unresolved interview gates | None                                                          |

#### Human decisions and approvals

- [ ] If legacy totals cannot be reconciled with per-news deduplication, obtain approval for an explicit cutover/history policy before migrating or resetting counters.

#### Work

- [ ] Count matching retained news on rule application and new matches during ingestion, once per news item per filter.
- [ ] Use the same accounting for Done and immediate quick-tag additions, without double-counting later reprocessing.
- [ ] Preserve existing per-matching-rule attribution and distinguish it from exclusive contribution to hiding a news item.
- [ ] Expose lifetime totals and agreed timestamps consistently through API and filter UI; do not introduce a second current-match counter.
- [ ] Keep creation/editing/matching metadata distinct and migrate only evidenced legacy activity history.
- [ ] Retain only minimal matched-source identity/timing needed for durable deduplication after news removal, not a post/media archive.
- [ ] Investigate legacy daily totals against retained-match backfill; do not silently double-count or invent missing per-news receipts.
- [ ] Advance activity only on a newly counted unique match; use creation time before the first match.
- [ ] Refresh statistics on the events that actually change the displayed measure.

#### Done when

- [ ] Ingestion and reprocessing follow the agreed counting policy without counting the same news twice for one filter.
- [ ] A new rule matching 20 retained news items reports 20 immediately after application and remains at 20 after repeated Done.
- [ ] Removing matched news does not reduce the filter's lifetime total.
- [ ] Editing, active switches and repeated processing of already counted matches do not update matching activity or delay automatic cleanup.
- [ ] New, edited, overlapping and never-matched rules show truthful dates and counts.
- [ ] Missing historical evidence is represented as unknown, not invented or silently backfilled from unavailable news.

#### Validation

- [ ] Repeat reprocessing, ingestion retry, overlapping rules, rule edits, old retained news and matched-news removal.
- [ ] Legacy aggregate totals with partially overlapping retained matches and missing per-news attribution.

### filter-editor

**Apply filter edits once with Done and simplify keyword authoring**

| Field                      | Value                                    |
| -------------------------- | ---------------------------------------- |
| Owner                      | `apps/tg-news-reader`                    |
| Status                     | not_started                              |
| Stories                    | [US02](prd.md#us02), [US04](prd.md#us04) |
| Depends on                 | [filter-statistics](#filter-statistics)  |
| Unresolved interview gates | None                                     |

#### Work

- [ ] Reuse and extend the existing staged batch flow for the filter editor and tag browser.
- [ ] Preserve quick Add Filter from a news hashtag as an immediate save and channel reprocessing, without opening a staged editor.
- [ ] Stage all filter-editor changes, including additions/removals, active switches and the channel's forwards setting.
- [ ] Extend the application batch to persist the rules and forwards setting together instead of mutating the channel separately.
- [ ] On Done, save the staged batch and reprocess all retained channel news once with the resulting active rules.
- [ ] Make names optional end-to-end; put keyword first and select it by default without changing existing matching semantics.
- [ ] On closing with unapplied edits, offer apply/discard/continue; apply reuses Done and failures preserve the open draft.
- [ ] Define retries and atomic application so partial saves are never presented as success.
- [ ] Reconcile quick additions with any pending editor draft so applying that draft cannot silently lose concurrently saved rules.

#### Done when

- [ ] Multiple edits trigger no per-edit reprocessing and exactly one channel-wide reprocessing pass on a changed batch submitted with Done.
- [ ] Active switches and the forwards setting cause no server mutation before application and are discarded together with the other draft edits.
- [ ] Removing a rule restores its uniquely matched news while preserving hiding by any remaining matching rule.
- [ ] A failed save does not lose the draft or present partial success as completion.
- [ ] Closing with unsaved edits allows apply, discard without mutations or return to editing without losing the draft.
- [ ] News visibility, counters and filter statistics reconcile after success.
- [ ] New filters default to keyword, can omit a separate name and retain the existing case-insensitive substring matcher.
- [ ] Quick tag actions and the tag browser follow explicitly consistent application rules.
- [ ] Quick news-tag additions apply immediately without committing unrelated draft edits; later Done preserves those additions.

#### Validation

- [ ] Mixed add/delete/toggle/forwards-setting batches, empty batches, all three close-prompt choices, failed saves from the prompt and repeated submission.
- [ ] Named/unnamed rules, existing saved filters and mobile/desktop authoring.
- [ ] Quick tag additions with a pending editor draft, failed quick saves and later Done/discard actions.

### bulk-filter-cleanup

**Remove low-use filters as one scoped operation**

| Field                      | Value                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| Owner                      | `apps/tg-news-reader`                                                    |
| Status                     | not_started                                                              |
| Stories                    | [US03](prd.md#us03)                                                      |
| Depends on                 | [filter-statistics](#filter-statistics), [filter-editor](#filter-editor) |
| Unresolved interview gates | None                                                                     |

#### Work

- [ ] Select current-channel filters at least 30 days old with zero to two lifetime matches inclusive, including never-matched filters.
- [ ] Expose candidate counts and the selection criteria in the cleanup UI.
- [ ] Show a selectable candidate preview, allow exclusions and stage only the selected removals as one batch.
- [ ] Keep bulk removals in the editor draft until Done, sharing the existing apply/discard/continue closing behavior.

#### Done when

- [ ] Zero, one and two matches qualify by usage; three or more do not.
- [ ] Filters younger than 30 days from creation never qualify; at 30 days the age requirement is satisfied.
- [ ] Other channels' filters remain untouched regardless of their usage and age.
- [ ] Only the intended candidate filters are removed.
- [ ] Excluding a candidate preserves it; closing the preview without selecting removals does not delete any rules.
- [ ] The operation applies visibility changes once and leaves unrelated channels/rules untouched.
- [ ] Staging bulk removals causes no server mutations; Done applies them and discard leaves saved rules unchanged.

#### Validation

- [ ] Counts at zero, one, two and above threshold; ages just below, exactly at and above 30 days; multiple channels; save failure.
- [ ] Candidate exclusions, empty selection, preview cancellation and later Done/discard of staged removals.

### automatic-filter-cleanup

**Retire stale filters under an explicit inactivity policy**

| Field                      | Value                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Owner                      | `apps/tg-news-reader`                                                                |
| Status                     | not_started                                                                          |
| Stories                    | [US05](prd.md#us05)                                                                  |
| Depends on                 | [filter-statistics](#filter-statistics), [bulk-filter-cleanup](#bulk-filter-cleanup) |
| Unresolved interview gates | None                                                                                 |

#### Work

- [ ] Reuse validated counters/timestamps and permanently delete filters meeting the agreed inactivity policy.
- [ ] Use a 30-day cutoff from the last newly counted unique match, or creation before any matches, without per-filter exemptions.
- [ ] Trigger cleanup only after that channel refresh succeeds and fetched news plus qualifying activity have been processed.
- [ ] Do not clean an unrefreshed or failed channel, or start a new Telegram refresh merely to run cleanup.
- [ ] Do not substitute the manual zero-to-two usage criterion for the automatic inactivity policy.
- [ ] Handle never-matched, disabled and unobserved rules explicitly under the common policy; do not introduce a protection flag.
- [ ] Enable cleanup only after activity/accounting migration is trustworthy or an explicit legacy cutover policy is approved; unknown history is not proof of zero use.
- [ ] Expose an observable cleanup result instead of silent destructive work.
- [ ] Reconcile retained news visibility against the remaining rules without deleting the news itself.

#### Done when

- [ ] Time-controlled checks permanently delete exactly the eligible filters under the common policy, without individual exemptions.
- [ ] Failed or absent channel refreshes never trigger automatic deletion.
- [ ] Matches from a successful refresh are evaluated and recorded before inactivity eligibility is checked.
- [ ] Editing, toggling or repeated Done without new unique matches does not delay the cutoff.
- [ ] Repeated execution is safe and news visibility reflects the resulting rules.

#### Validation

- [ ] Inactivity just below, exactly at and above 30 days; never-matched and disabled rules; dormant channels; repeated execution.
- [ ] Rule edits and active switches near the cutoff, repeated Done and a first newly counted match.
- [ ] Failed and successful empty refreshes, current-refresh matches, and one failed channel alongside a successfully refreshed channel.

## Search and day navigation

### retained-news-search

**Search all matching retained news rather than loaded pages**

| Field                      | Value                 |
| -------------------------- | --------------------- |
| Owner                      | `apps/tg-news-reader` |
| Status                     | not_started           |
| Stories                    | [US06](prd.md#us06)   |
| Depends on                 | None                  |
| Unresolved interview gates | None                  |

#### Work

- [ ] Implement case-insensitive literal substring search for the entire query within the approved scope, preserving chronological order.
- [ ] Treat spaces, punctuation and quotes literally rather than exposing token, phrase, wildcard or query-operator syntax.
- [ ] Search Telegram post text only; exclude loaded article content and do not fetch articles for search.
- [ ] Restrict queries and search-scoped actions to the current authorized channel; do not introduce group/global search.
- [ ] Keep the current read/unread and normal/hidden view predicates while adding the text condition.
- [ ] Keep the first search version free of embeddings and semantic retrieval.
- [ ] Compose search with tag, date and visibility in queries, pagination and query-cache identity.
- [ ] Propagate scope to digest, mark-read, undo and navigation.
- [ ] Preserve existing read-news deletion and media retention; query only retained records without archive/backfill work.

#### Done when

- [ ] Telegram-text matches are found while matches only in full article content are excluded.
- [ ] Matching retained items beyond the first page are returned with no pagination duplicates or omissions.
- [ ] Search only narrows results; publication order and cursor behavior remain consistent with the normal feed.
- [ ] Contiguous mixed-case phrases match, separated query words do not, and query punctuation has no operator meaning.
- [ ] Matching news from other channels is never returned, including channels owned by the same user.
- [ ] Search never brings read or hidden news into a view that currently excludes them; searching a hidden/all view preserves that chosen scope.
- [ ] Scoped bulk actions and digests never affect unrelated or empty-scope news.
- [ ] Empty results are distinct from failed requests; the UI does not claim removed news is searchable.

#### Validation

- [ ] Russian/English case handling, contiguous versus separated phrases, literal quotes/wildcard characters, article-only negative matches, hidden/read modes, mixed conditions and page boundaries.

### day-navigation

**Add sticky day groups and complete day selection**

| Field                      | Value                 |
| -------------------------- | --------------------- |
| Owner                      | `apps/tg-news-reader` |
| Status                     | not_started           |
| Stories                    | [US07](prd.md#us07)   |
| Depends on                 | None                  |
| Unresolved interview gates | None                  |

#### Work

- [ ] Navigate retained news only, without extending read-news/media retention or reconstructing removed posts.
- [ ] Group virtualized rows by publication day in the device timezone on both layouts.
- [ ] Use explicit local-midnight-to-next-midnight publication bounds consistently in server queries and scoped actions, not a fixed 24-hour duration.
- [ ] Include the selected local day and resolved timezone/bounds in relevant query/cache identity.
- [ ] Make the active day header sticky and selectable, with an explicit way to clear selection.
- [ ] Preserve active text/tag/read/hidden conditions on day selection; intersect them with the day range.
- [ ] Clear only the date constraint when clearing the selected day.
- [ ] Apply the day constraint server-side and propagate it to all scoped actions.

#### Done when

- [ ] Headers remain usable during scrolling and day selection covers all retained matching rows.
- [ ] Page boundaries, sticky toolbar offsets and keyboard navigation do not lose or duplicate news.
- [ ] Search/tag/day conditions intersect without resetting one another, and clearing the day preserves text/tag/read/hidden conditions.

#### Validation

- [ ] Publication versus ingestion date, device timezone changes, local midnight, 23/25-hour days, empty days, repeated timestamps and multiple pages per day.

## Digest quality

### ai-event-grouping

**Improve repetition handling in the digest only**

| Field                      | Value                 |
| -------------------------- | --------------------- |
| Owner                      | `apps/tg-news-reader` |
| Status                     | not_started           |
| Stories                    | [US01](prd.md#us01)   |
| Depends on                 | None                  |
| Unresolved interview gates | None                  |

#### Human decisions and approvals

- [ ] Approve representative ordinary and gaming news examples with expected grouping and advertising/spam outcomes.

#### Work

- [ ] Establish representative ordinary and gaming news examples with owner-approved grouping and action outcomes.
- [ ] Group updates by game/topic while distinguishing individual events and preserving newly added facts.
- [ ] Omit advertising and clear spam without ranking substantive unique news out of the digest.
- [ ] Limit comparisons to the current digest while preserving the existing input selection and original news cards.
- [ ] Maintain grouping across processing batches of the current digest without remembering previous digests.

#### Done when

- [ ] An announcement, trailer and release-date update for one game share one digest block with all distinct new facts retained.
- [ ] Reference examples merge repeated facts without losing distinct events or inventing supporting facts.
- [ ] Advertising/spam examples are omitted while lower-importance substantive news remains represented.
- [ ] Updates about one game across different processing batches share one block; previous digest runs do not suppress current facts.
- [ ] Every mentioned source exists and all state changes match approved semantics.
- [ ] Digest grouping, omission, ambiguity and provider failure never mutate original cards or their read-state.

#### Validation

- [ ] Same announcement across sources; announcement/trailer/release/review for one game; rumor versus confirmation.
- [ ] Advertising, spam, substantive product announcements and less prominent unique news.
- [ ] New details, contradictory sources, input truncation, cross-batch updates, independent digest runs and interrupted generation.

## Deferred work

### semantic-news-search

**Add semantic or hybrid retrieval only if approved**

| Field                      | Value                                           |
| -------------------------- | ----------------------------------------------- |
| Owner                      | `apps/tg-news-reader`                           |
| Status                     | not_started                                     |
| Stories                    | [US06](prd.md#us06)                             |
| Depends on                 | [retained-news-search](#retained-news-search)   |
| Unresolved interview gates | None                                            |
| Optional                   | true                                            |
| Delivery window            | Deferred; not part of the first search version. |

#### Human decisions and approvals

- [ ] Confirm later semantic-search scope, relevance examples and indexing budget before undertaking this slice.

#### Work

- [ ] Select indexing and retrieval mechanics from approved relevance examples and retained-data scope.
- [ ] Define indexing cost, updates and deletion consistency without assuming a separate vector database.

#### Done when

- [ ] Approved meaning-based examples retrieve relevant results without overriding exact-name search.
- [ ] Deleted or inaccessible news do not remain in results or embeddings.

#### Validation

- [ ] Synonyms, transliterated game names, exact titles, unrelated similar terms and deletion/reindex behavior.

### month-navigation

**Consider month filtering after the day workflow**

| Field                      | Value                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Owner                      | `apps/tg-news-reader`                                                                         |
| Status                     | not_started                                                                                   |
| Stories                    | [US07](prd.md#us07)                                                                           |
| Depends on                 | [day-navigation](#day-navigation)                                                             |
| Unresolved interview gates | None                                                                                          |
| Optional                   | true                                                                                          |
| Delivery window            | Later than day navigation; explicit month-navigation scope still needs separate confirmation. |

#### Work

- [ ] Obtain explicit month-navigation scope and acceptance examples before implementation.

#### Done when

- [ ] If approved, complete month results obey the same retention, timezone and scoped-action rules as day selection.

#### Validation

- [ ] Month/year boundaries, empty months and composition with other conditions.
