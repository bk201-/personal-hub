# VK Music Discovery implementation slices

**Product scope is confirmed; provider feasibility remains blocked. This format conversion does not start runtime work or authorize provider calls, publication or deployment.**

Converted from YAML to Markdown on 2026-11-09 at the owner's request. Original decisions, authorization boundaries and observation dates are preserved.

| Field         | Value                           |
| ------------- | ------------------------------- |
| Status        | blocked_on_provider_feasibility |
| Updated       | 2026-10-05                      |
| Prd           | [prd.md](prd.md)                |
| Owner         | apps/music-discovery            |
| App directory | apps/music-discovery            |

## Execution

| Field                  | Value                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Authorized             | 2026-10-05                                                                                                                       |
| Basis                  | Owner requested starting implementation of the confirmed plan.                                                                   |
| Current slice          | provider-feasibility                                                                                                             |
| Scope                  | Local implementation subject to the provider feasibility gate; no publication or deployment.                                     |
| Provider configuration | No app-specific credentials supplied or inspected; live experiments await deliberate configuration and bounded request approval. |

### Evidence

| Field    | Value                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Reviewed | 2026-10-05                                                                                                             |
| Decision | No-go for the integrated live pilot until permitted use and access are established; not a completed feasibility slice. |
| Activity | Public official documentation only; no community posts, authenticated calls, credentials or runtime changes.           |

#### Blockers

##### vk-content-transfer

| Field     | Value                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source    | https://dev.vk.com/ru/rules                                                                                                                               |
| Provision | Platform Rules revision 2026-08-19, sections 2.2 and 2.4.                                                                                                 |
| Finding   | Section 2.4 explicitly names wall.get and restricts transfer-related use without direct VK consent; permission to send posts to Azure is not established. |
| Required  | Establish permission for the exact transfer/extraction workflow before sending provider text to Azure.                                                    |

##### spotify-integration-policy

| Field     | Value                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Source    | https://developer.spotify.com/policy                                                                                            |
| Provision | Sections III.5, III.13 and III.14.                                                                                              |
| Finding   | Cross-service integration and content-analysis restrictions remain unresolved; Spotify content must never enter AI.             |
| Required  | Clarify the exact VK-to-Spotify search/matching workflow and permitted durable IDs/links, separately from technical API access. |

##### live-access-and-budget

| Field    | Value                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| Finding  | VK method/token compatibility, Spotify app credentials and Azure deployment compatibility have not been demonstrated. |
| Required | Deliberate app-local configuration, verified method documentation and owner-approved request/token/spend caps.        |

#### Documented constraints

##### Documented constraints 1

| Field   | Value                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Source  | https://developer.spotify.com/terms                                                                                           |
| Finding | Spotify content must not be stored indefinitely; permanent user-action facts must stay separate from provider payload caches. |

##### Documented constraints 2

| Field   | Value                                                                                 |
| ------- | ------------------------------------------------------------------------------------- |
| Source  | https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow |
| Finding | App-only catalog access does not require end-user library/playback authorization.     |

##### Documented constraints 3

| Field   | Value                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------- |
| Source  | https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide        |
| Finding | Development-mode owner must maintain Premium; current search maximum limit is 10 and default is 5. |

##### Documented constraints 4

| Field   | Value                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Source  | https://developer.spotify.com/documentation/web-api/references/changes/july-2026                                                  |
| Finding | July changes supersede the earlier one-client-ID limit with 25; development quota is account-wide, not independent per client ID. |

##### Documented constraints 5

| Field   | Value                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Source  | https://dev.vk.com/ru/method/wall.get                                                                                             |
| Finding | Latest retrieval did not expose usable method documentation; earlier token/pagination findings need reconfirmation before probes. |

##### Documented constraints 6

| Field   | Value                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Source  | https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs                                                  |
| Finding | Structured outputs require a supported deployment and constrained JSON Schema; nullable required fields support missing metadata. |

##### Documented constraints 7

| Field   | Value                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Source  | https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy                                               |
| Finding | No foundation-model training without permission is not zero retention; deployment geography and abuse monitoring require review. |

#### Resume when

- [ ] Provider permissions are established or the owner explicitly agrees a revised scope; no silent substitution or scraping.
- [ ] App-local access and Azure deployment details are deliberately supplied without secret values in chat.
- [ ] Bounded live calls, costs, data retention and date conventions are approved.

## Current scaffold

- App directory placeholder only; no package.json, runtime, dependencies or provider clients.
- Documentation research has not established live VK/Spotify/Azure access or approval.
- No code, credentials, account creation, provider calls or deployment is authorized by confirming this plan.

## Provenance

| Field               | Value                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Original created    | 2026-09-30                                                                                                  |
| Revision session id | 9a2bd5ca-029a-4538-b774-98500565ec6e                                                                        |
| Basis               | Product model confirmed by the owner on October 5; execution order remains a local implementation proposal. |
| Supersedes          | Initial viewed/read-oriented five-slice scaffold; no earlier slice was implemented.                         |

## Delivery rules

- Every slice belongs to apps/music-discovery and stays not_started until explicitly undertaken.
- Build thin end-to-end behavior; no generic music platform or up-front migration of news domain code.
- A slice is done only after its observable criteria are demonstrated, not when its schema or UI alone exists.
- Add behavioral coverage alongside each slice; the final readiness slice is not the first testing phase.
- Keep changes local unless separately authorized for commit/publication; deployment needs its own approval.
- Use shared browser/auth mechanics but separate users, sessions, cookies, databases and provider secrets.
- Keep source ingestion identity, active cards, journal facts and evictable provider content distinct.
- Never retain a deleted card as an archived album record to simplify the six-month rule.
- Design for the observed 30 communities and 10-20 aggregate daily posts without hardcoding those as limits.

## Milestones

### M1

| Field | Value                                                           |
| ----- | --------------------------------------------------------------- |
| Goal  | Permitted provider access and a useful one-post discovery path. |

#### Slices

- [provider-feasibility](#provider-feasibility)
- [first-release-discovery](#first-release-discovery)

### M2

| Field | Value                                                                                       |
| ----- | ------------------------------------------------------------------------------------------- |
| Goal  | Reliable personal queue with real deletion, durable journal and correct repeat suppression. |

#### Slices

- [closure-and-journal](#closure-and-journal)
- [duplicate-and-rediscovery](#duplicate-and-rediscovery)
- [source-management-and-refresh](#source-management-and-refresh)

### M3

| Field | Value                                                              |
| ----- | ------------------------------------------------------------------ |
| Goal  | Repairable results and complete desktop/mobile discovery workflow. |

#### Slices

- [manual-review-and-recovery](#manual-review-and-recovery)
- [browsing-and-bulk-actions](#browsing-and-bulk-actions)

### M4

| Field | Value                                                                                       |
| ----- | ------------------------------------------------------------------------------------------- |
| Goal  | Independent local application ready for owner acceptance, not automatic production rollout. |

#### Slices

- [local-readiness](#local-readiness)

## Slices

### provider-feasibility

| Field   | Value                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Title   | Prove permitted access with representative posts                                                                                     |
| Owner   | apps/music-discovery                                                                                                                 |
| Status  | blocked                                                                                                                              |
| Outcome | A recorded go/no-go decision for the exact non-streaming VK-to-Spotify workflow.                                                     |
| Stop if | Required access, usage permission or acceptable cost cannot be established; revisit scope without scraping or provider substitution. |

#### Depends on

None.

#### Stories

- [US-02](prd.md#us-02)
- [US-03](prd.md#us-03)
- [US-04](prd.md#us-04)
- [US-05](prd.md#us-05)
- [US-10](prd.md#us-10)

#### Work

- [ ] Review current first-party VK, Spotify and Azure usage/access rules before authenticated experiments.
- [ ] Resolve Spotify cross-service/content-analysis policy applicability, AI exclusion and journal/cache retention constraints.
- [ ] Configure deliberately authorized server-owned app credentials outside the repository and logs.
- [ ] Read all three PRD sample communities through supported VK methods with pagination and a bounded time range.
- [ ] Select representative normal album, single/track, playlist-attachment, mixed-format and non-music posts.
- [ ] Verify text remains sufficient when audio/playlist metadata is absent or region-restricted; never request audio bytes.
- [ ] Exercise Spotify Client Credentials search for CZ, exact/Deluxe/Remaster examples and invalid/ambiguous lookups.
- [ ] Confirm album/track share-URL forms, permitted redirects, artwork attribution and provider quotas.
- [ ] Confirm the actual Azure deployment name and structured extraction support without assuming the informal model label.
- [ ] Measure a bounded representative extraction batch and propose request/retry/cost limits for larger backfills.
- [ ] Create only permitted, non-sensitive or synthetic fixtures; do not commit copied account data or unrestricted provider payloads.

#### Human steps

- [ ] Owner authorizes account/app configuration and supplies secrets through local server configuration, not chat.
- [ ] Seek provider clarification where policy applicability is unresolved; do not label a technical success as approval.
- [ ] Approve cost/batch limits and choose the date-arithmetic timezone before implementation.

#### Done when

- [ ] Evidence separately records documented behavior, permitted use, live access outcomes and remaining restrictions.
- [ ] All required provider paths work with permitted credentials, or a specific blocker stops subsequent runtime work.
- [ ] Text-only recognition yields a valid identification or honest review result, not invented metadata.
- [ ] Account authorization has no Spotify playback/library scopes or reuse of a browser session token.

#### Validation

- [ ] Representative public walls, pinned posts and missing audio/playlist fields.
- [ ] Exact album, allowed alternate edition, wrong artist, unknown year, track and unavailable CZ result.
- [ ] Redacted auth failure, quota/429 and invalid structured-model output behavior.

### first-release-discovery

| Field   | Value                                                                                      |
| ------- | ------------------------------------------------------------------------------------------ |
| Title   | Discover one release in an independent personal app                                        |
| Owner   | apps/music-discovery                                                                       |
| Status  | not_started                                                                                |
| Outcome | One bounded source post reaches a useful Spotify card or an honest VK-style review result. |

#### Depends on

- [provider-feasibility](#provider-feasibility)

#### Stories

- [US-01](prd.md#us-01)
- [US-04](prd.md#us-04)
- [US-06](prd.md#us-06)

#### Work

- [ ] Create the private workspace with existing repository scripts/tooling, app-local storage and shared mechanics.
- [ ] Add app-specific ports, cookie names and explicit account provisioning; keep the technical music-discovery directory.
- [ ] Establish small app-owned ingestion, extraction and catalog-matching boundaries with substitute providers for tests.
- [ ] Persist source identity/text/link, structured extraction evidence and matching outcome independently.
- [ ] Implement AI-first text classification and extraction with nullable year/genre and validated structured output.
- [ ] Keep Spotify data entirely outside the AI request path.
- [ ] Implement deterministic exact-before-Deluxe/Remaster matching with explicit ambiguity and CZ market.
- [ ] Render one music card or source-post review result, preserving VK navigation.
- [ ] Establish minimum journal events for discovery, refresh and link-open actions from the first useful flow.

#### Done when

- [ ] Owner can sign in independently and process a representative post without manual database edits.
- [ ] One post produces at most one discovery; attached tracks do not become a collection of cards.
- [ ] Confidently non-music content has no card; uncertain content is reviewable.
- [ ] Optional metadata/artwork absence does not break the flow.
- [ ] A Spotify link opens without changing queue presence or marking listening.

#### Validation

- [ ] Source text instructions cannot override the extraction contract or trigger tools.
- [ ] Different artists with identical titles are not merged or auto-linked as the same work.
- [ ] Missing year, wrong year, ambiguous candidates and changed remaster year are distinct cases.
- [ ] Independent auth isolation and public-source rendering do not leak secrets or permit script injection.

### closure-and-journal

| Field   | Value                                                                               |
| ------- | ----------------------------------------------------------------------------------- |
| Title   | Close cards permanently and retain useful action history                            |
| Owner   | apps/music-discovery                                                                |
| Status  | not_started                                                                         |
| Outcome | The owner can finish an item and later find what happened without an archived card. |

#### Depends on

- [first-release-discovery](#first-release-discovery)

#### Stories

- [US-07](prd.md#us-07)
- [US-08](prd.md#us-08)

#### Work

- [ ] Implement listened-and-remove and remove as separate atomic, idempotent actions.
- [ ] Delete active card/source-content records while retaining permitted journal facts and minimal source receipts.
- [ ] Associate journal events using durable source/user-derived release identity rather than a foreign key requiring the card to survive.
- [ ] Store human-readable event labels and links under provider retention constraints, never entire provider/card snapshots.
- [ ] Build the chronological journal with artist/album grouping, search and filtering, including unknown-identity events.
- [ ] Record source/music navigation as an attempted open, not external playback.
- [ ] Make late lookup completion and repeated requests respect an already committed closure.

#### Done when

- [ ] Closing removes the card and its retained content with no hidden/archive/trash state.
- [ ] Journal search and artist/album groups still show discovery, navigation and correct closure types across deleted and later independent cards.
- [ ] A failure cannot delete a card without its closure event or record closure without applying the action.
- [ ] Job replay/repeated closure produces no duplicate closure events or recreated card.
- [ ] Journal persistence is independent of provider cache eviction.

#### Validation

- [ ] Listen/remove distinction and navigation-only events.
- [ ] Crash/retry at the journal-write/card-delete boundary.
- [ ] Closing a card while extraction or matching is in flight.
- [ ] Missing metadata, source deletion, journal lookup and no archived-content residue.

### duplicate-and-rediscovery

| Field   | Value                                                                                       |
| ------- | ------------------------------------------------------------------------------------------- |
| Title   | Suppress repeats and allow a new discovery after six months                                 |
| Owner   | apps/music-discovery                                                                        |
| Status  | not_started                                                                                 |
| Outcome | Reposts do not crowd the queue, but a genuinely later recommendation can be explored again. |

#### Depends on

- [closure-and-journal](#closure-and-journal)

#### Stories

- [US-08](prd.md#us-08)
- [US-09](prd.md#us-09)

#### Work

- [ ] Reconcile reliable release identity across permitted source/provider identifiers and allowed edition evidence.
- [ ] Keep original release identity/year distinct from a Spotify edition title/year.
- [ ] Ignore a repeated source identity before paid extraction where possible.
- [ ] Ignore release duplicates of active cards without changing the card, sort date or retained source.
- [ ] Discard duplicate source content; retain only ingestion receipts and aggregate refresh counts.
- [ ] Query the latest matching listened/remove closure from the journal, not an archive table.
- [ ] Compare the new post's publication time to closure plus six calendar months.
- [ ] Create a new independent card when eligible; preserve the earlier journal history without restoring old data.
- [ ] Make eligibility and card insertion concurrency-safe across communities and processing stages.
- [ ] Handle unknown identity conservatively and re-evaluate deduplication when manual repair supplies reliable identity.

#### Human steps

- [ ] Accept fixture-based identity rules and the explicit month-end/timezone convention; no fuzzy-title-only merging.

#### Done when

- [ ] An active card blocks every duplicate regardless of age.
- [ ] A post before the six-month boundary is ignored; one at/after it can create a new card if none is active.
- [ ] Ignored repeats do not reset the boundary, add individual journal events or retain new provenance.
- [ ] Re-fetching the same old post never creates rediscovery, even years later.
- [ ] A later card has a new identity and can show prior listened/removed dates from the journal.

#### Validation

- [ ] Same release from two communities on the same day and two days apart.
- [ ] Concurrent ingestion and closure, plus races between two eligible later posts.
- [ ] Boundary before/at/after six calendar months, leap day, month end and timezone transition.
- [ ] Week-long catch-up, old backfill, unknown-year ambiguity and approved edition fallback.
- [ ] A new closure on rediscovery becomes the next interval anchor.

### source-management-and-refresh

| Field   | Value                                                                                   |
| ------- | --------------------------------------------------------------------------------------- |
| Title   | Manage public sources and catch up with one durable refresh                             |
| Owner   | apps/music-discovery                                                                    |
| Status  | not_started                                                                             |
| Outcome | The owner can configure about 30 sources and safely collect all missed posts on demand. |

#### Depends on

- [duplicate-and-rediscovery](#duplicate-and-rediscovery)

#### Stories

- [US-02](prd.md#us-02)
- [US-03](prd.md#us-03)
- [US-08](prd.md#us-08)
- [US-09](prd.md#us-09)
- [US-10](prd.md#us-10)

#### Work

- [ ] Add the flat source-management dialog with canonical community validation and inclusive start dates.
- [ ] Default each source to a 30-day lookback but allow any explicitly chosen bounded import period.
- [ ] Add explicit older-history backfill without resetting incremental progress or processed-post identity.
- [ ] Implement paginated per-source ingestion with durable pending work before checkpoint advancement.
- [ ] Separate source coverage from extraction/matching completion and from surviving queue content.
- [ ] Add one manual refresh job with fetching/recognizing/matching descriptions and inspectable persisted status.
- [ ] Prevent overlapping refresh jobs and make browser navigation irrelevant to server-side progress.
- [ ] Aggregate per-source successes/failures and journal the run outcome without hiding partial failure.
- [ ] Remove source configuration without deleting existing cards, minimal receipts or journal attribution.
- [ ] Protect removal during refresh so late work does not recreate source configuration.

#### Done when

- [ ] Inclusive initial dates and a later refresh cover all intervening posts even after a holiday.
- [ ] Pinned/overlapping pages and retries neither skip pending posts nor multiply cards.
- [ ] One failing source does not discard another source's progress.
- [ ] Returning to the page shows the ongoing/completed run and partial errors.
- [ ] Remove/re-add and historical backfill respect source receipts and six-month rediscovery.

#### Validation

- [ ] Empty source, all-non-music source, many duplicates and larger-than-average bursts.
- [ ] Crash between page persistence and checkpoint update, then resume.
- [ ] New posts arriving during pagination and repeated refresh clicks from separate tabs.
- [ ] Remove a source during work, then add it again with an earlier date.
- [ ] Card deletion empties the queue without losing the independent ingestion checkpoint.

### manual-review-and-recovery

| Field   | Value                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------- |
| Title   | Repair unresolved music and retry only genuinely failed work                                    |
| Owner   | apps/music-discovery                                                                            |
| Status  | not_started                                                                                     |
| Outcome | Every unresolved item has an honest reason and a useful next action without repeated paid work. |

#### Depends on

- [source-management-and-refresh](#source-management-and-refresh)

#### Stories

- [US-04](prd.md#us-04)
- [US-05](prd.md#us-05)
- [US-08](prd.md#us-08)
- [US-09](prd.md#us-09)
- [US-10](prd.md#us-10)

#### Work

- [ ] Present unrecognized, ambiguous and successful-not-found items in one source-post review section.
- [ ] Display service/stage failures separately from extraction uncertainty and completed no-result searches.
- [ ] Add/replace only supported Spotify links using validated service parsing and permitted identity lookup.
- [ ] Preserve explicit user-link choices and journal repair events.
- [ ] Reconcile a repaired item with an existing active card and preserve action associations without retaining repost bodies.
- [ ] Specify and show confirmation when a correction collides with a recently closed journal identity.
- [ ] Retry transient failed stages on the next explicit refresh, honoring provider backoff without endless background polling.
- [ ] Keep successful unrecognized/not_found outcomes terminal unless the owner explicitly requests another search.
- [ ] Reuse completed extraction after a Spotify outage and do not discard manual choices during retries.
- [ ] Surface invalid credentials/permissions/quotas as actionable configuration failures, not automatic no-match.

#### Done when

- [ ] A valid manual link resolves a source post even when AI did not identify it.
- [ ] A resolved but incorrectly linked card can be corrected without an automatic overwrite later.
- [ ] Unsupported URLs are rejected clearly; service outage during link validation leaves a recoverable explicit state.
- [ ] Provider outages are retryable while previously successful empty results receive no extra automatic requests.
- [ ] Manual conflict resolution neither silently deletes user work nor violates active-card uniqueness.

#### Validation

- [ ] Album/track share links, unsupported services, malicious URLs and unsafe redirects.
- [ ] Manual correction to an existing active release, a recently closed release and an unknown release.
- [ ] Spotify outage after successful Azure work, Azure invalid output, expired credentials and rate limits.
- [ ] Request/job replay, manual edits racing refresh and explicit retry of a terminal no-result item.

### browsing-and-bulk-actions

| Field   | Value                                                                                        |
| ------- | -------------------------------------------------------------------------------------------- |
| Title   | Complete the cover-first desktop and mobile workflow                                         |
| Owner   | apps/music-discovery                                                                         |
| Status  | not_started                                                                                  |
| Outcome | Both devices support exploring, opening and finishing the queue without news-reader clutter. |

#### Depends on

- [manual-review-and-recovery](#manual-review-and-recovery)

#### Stories

- [US-06](prd.md#us-06)
- [US-07](prd.md#us-07)
- [US-08](prd.md#us-08)

#### Work

- [ ] Implement both cover grid and compact list, with accessible labels and actions rather than image-only navigation.
- [ ] Add artist/title/year/genre presentation, permitted artwork fallback and source-text expansion.
- [ ] Keep review posts readable with text/images, original VK links, repair and retry controls but no audio player.
- [ ] Add source-post date, artist, title and original-year sorts in both directions.
- [ ] Default to newest posts, remember view/sort and put unknown years last.
- [ ] Add text search and Music/Needs review sections, keeping complex filters out of the first-version gate.
- [ ] Preserve position after Spotify navigation and distinguish navigation from listening.
- [ ] Add selected-card and all-current-result-set bulk closure with explicit count/scope confirmation.
- [ ] Snapshot bulk target identities so newly arriving cards cannot enter an already confirmed operation.
- [ ] Provide meaningful empty, partial-processing, service-failure and no-artwork states without unread counters.

#### Done when

- [ ] Grid and list both work on phone and desktop with equivalent core actions.
- [ ] Reposts do not change card position; year sorting uses original year, not an unexplained remaster date.
- [ ] Returning from Spotify restores browsing state and leaves cards intact.
- [ ] Bulk listened/remove preserves each target's distinct journal identity and excludes untargeted cards.
- [ ] Journal can locate a prior album even though its former card no longer exists.

#### Validation

- [ ] Narrow/wide layouts, keyboard/touch access, long titles and missing images.
- [ ] Ascending/descending sorts, ties, unknown years and persistent user choice.
- [ ] Search plus cross-page selection, concurrent arrivals and partial/retried bulk requests.
- [ ] Spotify installed/uninstalled navigation where practical; never assert guaranteed native launch or playback.

### local-readiness

| Field   | Value                                                                                       |
| ------- | ------------------------------------------------------------------------------------------- |
| Title   | Demonstrate the complete independent personal workflow                                      |
| Owner   | apps/music-discovery                                                                        |
| Status  | not_started                                                                                 |
| Outcome | A locally runnable app satisfying the confirmed scope without affecting other applications. |

#### Depends on

- [browsing-and-bulk-actions](#browsing-and-bulk-actions)

#### Stories

- [US-01](prd.md#us-01)
- [US-02](prd.md#us-02)
- [US-03](prd.md#us-03)
- [US-04](prd.md#us-04)
- [US-05](prd.md#us-05)
- [US-06](prd.md#us-06)
- [US-07](prd.md#us-07)
- [US-08](prd.md#us-08)
- [US-09](prd.md#us-09)
- [US-10](prd.md#us-10)

#### Work

- [ ] Exercise complete workflows with disposable databases, synthetic provider fixtures and failure injection.
- [ ] Add workspace commands to existing root orchestration and validate consumers of any changed shared package.
- [ ] Document app-owned configuration, explicit user provisioning, migrations, ports and cookie isolation.
- [ ] Verify persistent journal backup/recovery needs separately from evictable provider caches.
- [ ] Confirm no deleted cards, duplicate post bodies, credentials or provider-response snapshots survive unintentionally.
- [ ] Exercise the actual owner-authorized live flow on bounded samples only after the feasibility gate.
- [ ] Record remaining platform/browser/provider limitations without claiming unsupported native playback guarantees.
- [ ] Prepare later same-domain deployment considerations without copying news cloud resources or activating production.

#### Done when

- [ ] Every PRD story has observable acceptance evidence and all required automated regression coverage passes.
- [ ] Both device layouts support source setup, catch-up, review repair, navigation, closure and journal lookup.
- [ ] Six-month behavior is demonstrated through clock-controlled fixtures rather than waiting or editing live history.
- [ ] Existing news/Czech/CV behavior and independent auth/data boundaries remain intact.
- [ ] The owner accepts the local product; publication and production remain separately authorized tasks.

#### Validation

- [ ] Existing workspace test, typecheck, lint, formatting and build scripts; a build does not replace tests.
- [ ] Redacted live-source acceptance and disposable regression scenarios for each story.
- [ ] Process restart, storage failure, provider outage, backfill burst and journal persistence after real deletion.

## Traceability

### US-01

- [first-release-discovery](#first-release-discovery)
- [local-readiness](#local-readiness)

### US-02

- [provider-feasibility](#provider-feasibility)
- [source-management-and-refresh](#source-management-and-refresh)
- [local-readiness](#local-readiness)

### US-03

- [provider-feasibility](#provider-feasibility)
- [source-management-and-refresh](#source-management-and-refresh)
- [local-readiness](#local-readiness)

### US-04

- [provider-feasibility](#provider-feasibility)
- [first-release-discovery](#first-release-discovery)
- [manual-review-and-recovery](#manual-review-and-recovery)
- [local-readiness](#local-readiness)

### US-05

- [provider-feasibility](#provider-feasibility)
- [manual-review-and-recovery](#manual-review-and-recovery)
- [local-readiness](#local-readiness)

### US-06

- [first-release-discovery](#first-release-discovery)
- [browsing-and-bulk-actions](#browsing-and-bulk-actions)
- [local-readiness](#local-readiness)

### US-07

- [closure-and-journal](#closure-and-journal)
- [browsing-and-bulk-actions](#browsing-and-bulk-actions)
- [local-readiness](#local-readiness)

### US-08

- [closure-and-journal](#closure-and-journal)
- [duplicate-and-rediscovery](#duplicate-and-rediscovery)
- [source-management-and-refresh](#source-management-and-refresh)
- [manual-review-and-recovery](#manual-review-and-recovery)
- [browsing-and-bulk-actions](#browsing-and-bulk-actions)
- [local-readiness](#local-readiness)

### US-09

- [duplicate-and-rediscovery](#duplicate-and-rediscovery)
- [source-management-and-refresh](#source-management-and-refresh)
- [manual-review-and-recovery](#manual-review-and-recovery)
- [local-readiness](#local-readiness)

### US-10

- [provider-feasibility](#provider-feasibility)
- [source-management-and-refresh](#source-management-and-refresh)
- [manual-review-and-recovery](#manual-review-and-recovery)
- [local-readiness](#local-readiness)

## Follow up tracks

### additional-music-links

| Field     | Value                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Status    | deferred                                                                                                |
| Goal      | Add Bandcamp and SoundCloud through provider-specific link parsing and deliberate access/usage review.  |
| Guardrail | Future multiple links do not authorize arbitrary URLs, scraping or speculative provider frameworks now. |

### metadata-enrichment

| Field     | Value                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Status    | blocked_on_permitted_access                                                                                  |
| Goal      | Investigate optional Discogs and Metal Archives year/style enrichment.                                       |
| Guardrail | Missing enrichment never blocks a useful supported music link; official documentation access was unverified. |

### closed-communities

| Field     | Value                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Status    | blocked_on_permitted_access                                                                                    |
| Goal      | Read member-accessible closed walls only after token permissions and content-processing terms are established. |
| Guardrail | Public-wall feasibility does not prove private access or permission to send private content to Azure.          |

### advanced-browsing

| Field  | Value                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------- |
| Status | deferred                                                                                       |
| Goal   | Add metadata filters or richer editing only after the simple sorting-first workflow is in use. |

### publication-and-hosting

| Field     | Value                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Status    | separate_authorization_required                                                                                |
| Goal      | Plan same-domain routing, hosting, secrets, journal backups and independent deployment after local acceptance. |
| Guardrail | No inherited news infrastructure, SSO, shared user storage or production activation is implied.                |
