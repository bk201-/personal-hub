# TG News Reader feed, filters, search and Luna requirements

**Requirements confirmed; planning only. Implementation has not started.**

| Field                 | Value                                    |
| --------------------- | ---------------------------------------- |
| Status                | requirements_confirmed_planning_only     |
| Created               | 2026-11-06                               |
| Requirements updated  | 2026-11-06                               |
| Converted to markdown | 2026-11-09                               |
| Owner                 | `apps/tg-news-reader`                    |
| Implementation plan   | [Implementation plan](implementation.md) |
| Implementation status | not_started                              |

## Problem

Reduce repeated news and manual filter maintenance, make retained news easier to find and navigate, and migrate the digest away from the retiring model without coupling the migration to a redesign of the feed.

## Audience and scope

| Field        | Value                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------- |
| Primary user | The existing reader owner.                                                                |
| Surfaces     | Existing desktop list and mobile accordion, without assuming different product semantics. |
| Scope limit  | No new multi-user behavior, shared identity or cross-app storage.                         |

## Provenance and authorization

| Field                     | Value                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Session id                | f66925ed-d153-4301-bc5b-d2229c966fa9                                                                                          |
| Original request          | The initial seven-point proposal in this conversation; explicitly planning-only.                                              |
| Original scope            | Seven owner proposals covering AI grouping, filter management, search and date navigation.                                    |
| Subsequent decision       | Owner selected Azure GPT-6 Luna for the digest migration on November 6.                                                       |
| Persistence authorization | Owner requested saving both the original proposals and the Luna plan under plans.                                             |
| Limit                     | Planning and clarification only; no runtime changes, paid inference, resource creation, publication or production activation. |

The owner requested Markdown plans on 2026-11-09. This conversion changes the document format only; the 2026-11-06 decisions and authorization limits remain unchanged.

On 2026-11-09, the owner separately authorized committing and publishing the plans and related documentation through a PR. Runtime implementation, paid inference, resource changes and production activation remain outside this authorization.

## Confirmed decisions

| ID  | Confirmed  | Question      | Decision                                                                                                                                                                   |
| --- | ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | -          | -             | Preserve all seven original requests as planned work, not implemented features; the interview decisions below define their scope.                                          |
| D02 | -          | -             | Target GPT-6 Luna through Azure for the digest, not a separately paid direct-provider integration.                                                                         |
| D03 | -          | -             | Keyword should appear first in filter authoring and a separate filter name should be optional.                                                                             |
| D04 | -          | -             | Month filtering is lower priority than day separators and day selection.                                                                                                   |
| D05 | -          | -             | Clarify requirements interactively, one question at a time, and persist the owner's answers.                                                                               |
| D06 | 2026-11-06 | [Q01](#q01)   | AI repetition handling affects the digest only; original news cards and their existing feed behavior remain unchanged.                                                     |
| D07 | 2026-11-06 | [Q02](#q02)   | Combine updates about the same game/topic into one digest block, preserving distinct new facts and merging repetition.                                                     |
| D08 | 2026-11-06 | [Q03](#q03)   | Omit advertising and clear spam from the digest, but do not discard substantive unique news merely because AI considers it less important.                                 |
| D09 | 2026-11-06 | [Q04](#q04)   | Group all selected inputs of the current digest without remembering or comparing previous digests.                                                                         |
| D10 | 2026-11-06 | [Q05](#q05)   | Stage changes in the filter editor without reprocessing; Done saves them together and reprocesses all retained channel news once using the resulting rules.                |
| D11 | 2026-11-06 | [Q05b](#q05b) | Closing the filter editor with unapplied changes asks whether to apply, discard or continue editing; applying uses the same save/reprocessing path as Done.                |
| D12 | 2026-11-06 | [Q05a](#q05a) | All filter-editor changes wait for Done, including rule additions/removals, active switches and the channel's forwards-filtering setting.                                  |
| D13 | 2026-11-06 | [Q05c](#q05c) | Add Filter from a news hashtag saves the rule and reprocesses the channel immediately, as an explicit exception to the staged filter editor.                               |
| D14 | 2026-11-06 | [Q06](#q06)   | Display lifetime unique-news matches per filter, including news subsequently removed, rather than a current-match count or dual current/total display.                     |
| D15 | 2026-11-06 | [Q06a](#q06a) | Applying a new filter counts matching retained news immediately; each news item counts once per filter, not again on repeated Done.                                        |
| D16 | 2026-11-06 | [Q07](#q07)   | Manual low-use bulk cleanup uses zero to two lifetime matches inclusive; never-matched rules satisfy the usage criterion.                                                  |
| D17 | 2026-11-06 | [Q07a](#q07a) | Manual low-use cleanup excludes filters younger than 30 days, measured from creation.                                                                                      |
| D18 | 2026-11-06 | [Q07b](#q07b) | Manual low-use cleanup operates only on the current channel through its filter-management window, not globally across channels.                                            |
| D19 | 2026-11-06 | [Q07c](#q07c) | Manual cleanup shows selectable candidates so the owner can exclude rules before staging removals; Done commits the selected removals.                                     |
| D20 | 2026-11-06 | [Q08](#q08)   | Automatic cleanup permanently deletes eligible inactive filters rather than disabling or archiving them.                                                                   |
| D21 | 2026-11-06 | [Q08a](#q08a) | The automatic cleanup inactivity period is 30 days without qualifying matching activity.                                                                                   |
| D22 | 2026-11-06 | [Q08b](#q08b) | Automatic cleanup waits for a successful refresh of the affected channel and evaluates fetched news before deleting stale filters; failed refreshes do not permit cleanup. |
| D23 | 2026-11-06 | [Q08c](#q08c) | Automatic cleanup has no per-filter protection or exemption flag; all filters follow the common cleanup policy.                                                            |
| D24 | 2026-11-06 | [Q09](#q09)   | Only a newly counted unique match advances filter activity; edits, active switches and repeated Done do not. Before the first match, inactivity is measured from creation. |
| D25 | 2026-11-06 | [Q10](#q10)   | Keyword is both the first filter type in the list and the selected default when creating a filter.                                                                         |
| D26 | 2026-11-06 | [Q11](#q11)   | The first search version covers words and phrases only; semantic/hybrid retrieval is deferred to later work.                                                               |
| D27 | 2026-11-06 | [Q11a](#q11a) | Word/phrase search covers Telegram post text only, not loaded full article content.                                                                                        |
| D28 | 2026-11-06 | [Q11b](#q11b) | Search narrows the feed while preserving its existing chronological order; do not rank results by relevance.                                                               |
| D29 | 2026-11-06 | [Q11c](#q11c) | Match the entire query as a case-insensitive literal substring, like browser Find; do not split words or interpret quoted phrases as query syntax.                         |
| D30 | 2026-11-06 | [Q12](#q12)   | Search only news still retained by the app; preserve removal of read news on refresh and do not add a searchable read-news archive.                                        |
| D31 | 2026-11-06 | [Q12a](#q12a) | Search is restricted to the current channel, not the current group or all owned channels.                                                                                  |
| D32 | 2026-11-06 | [Q12b](#q12b) | Search respects the active read/unread and normal/hidden view instead of searching across all retained states.                                                             |
| D33 | 2026-11-06 | [Q13](#q13)   | Day grouping and selection use news publication time in the device timezone, not ingestion time or a fixed Europe/Prague timezone.                                         |
| D34 | 2026-11-06 | [Q13a](#q13a) | Selecting a day preserves the active text query and tag; day, text and tag intersect while the read/unread and normal/hidden view stays unchanged.                         |
| D35 | 2026-11-06 | [Q14](#q14)   | Prioritize the Luna migration first; the other tracks are not ranked. This preference does not authorize implementation or production activation.                          |
| D36 | 2026-11-06 | [Q15](#q15)   | Use Global Standard for Luna on the existing Sweden Central resource; global inference routing is accepted and quota/capacity still needs verification.                    |
| D37 | 2026-11-06 | [Q16](#q16)   | Target at most 120 seconds for fully completed uncached text of one batch of up to 50 news items, including required article prefetch and excluding TTS.                   |

### Implementation proposals to validate

- Validate manual cleanup rules before enabling automatic cleanup.
- Use Azure v1 Chat Completions for the digest without an unnecessary Responses API rewrite.
- Start the Luna reasoning investigation at medium, not max; choose limits from measured behavior.

### Preservation constraints

- Preserve existing digest selection, prompt and batch behavior during the model migration.
- Keep TTS unchanged and retain the old text deployment for rollback.
- Do not add a silent fallback to another model or separately billed provider.

## User stories and acceptance criteria

Criteria remain unchecked until the behavior is implemented and demonstrated. Confirmed scope is not evidence of a completed feature.

### US01

**Read a less repetitive digest while retaining distinct events and new facts, especially for gaming news.**

| Field               | Value                                              |
| ------------------- | -------------------------------------------------- |
| Owner               | `apps/tg-news-reader`                              |
| Scope status        | scope_confirmed_examples_pending                   |
| Interview questions | [Q01](#q01), [Q02](#q02), [Q03](#q03), [Q04](#q04) |

- [ ] An announcement, trailer and release-date update about one game appear in one digest block.
- [ ] Distinct updates remain distinguishable within the game/topic block, new facts are preserved and repeated facts are merged.
- [ ] Advertising and clear spam are omitted; substantive unique news is not omitted based on perceived importance.
- [ ] Grouping covers the entire current digest across processing batches; previous digests do not suppress or alter its news.
- [ ] Grouped facts retain valid source references.
- [ ] AI grouping changes only the digest; it does not group, hide, delete or change read-state of the original news cards.

### US02

**Edit multiple filters without reprocessing the news after every individual action and see meaningful usage counts.**

| Field               | Value                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Owner               | `apps/tg-news-reader`                                                                             |
| Scope status        | scope_confirmed                                                                                   |
| Interview questions | [Q05](#q05), [Q05a](#q05a), [Q05b](#q05b), [Q05c](#q05c), [Q06](#q06), [Q06a](#q06a), [Q09](#q09) |

- [ ] Pending filter changes cause no per-change reprocessing; Done saves the batch and reprocesses all retained channel news once.
- [ ] Active switches and the forwards-filtering setting remain unapplied drafts until Done or apply from the closing prompt.
- [ ] Quick Add Filter from a news hashtag saves immediately and reprocesses the channel without requiring Done.
- [ ] A quick action does not apply or discard unrelated editor draft changes, and later application does not silently overwrite the quick-added rule.
- [ ] Removing a rule restores news hidden only by that rule; news matching another active rule stays hidden.
- [ ] Closing with unapplied changes offers apply, discard or continue editing; discard makes no changes and continue keeps the draft open.
- [ ] Applying from the closing prompt behaves like Done; failures retain the draft and are not reported as success.
- [ ] The displayed usage count is lifetime unique-news matches per filter, survives news removal and refreshes after relevant application/ingestion.
- [ ] A new filter matching 20 retained news items has a total of 20 after application; another Done without new matches leaves it at 20.
- [ ] Repeated application does not inflate historical unique-match counts.

### US03

**Remove many low-use filters with one bulk operation rather than deleting them individually.**

| Field               | Value                                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| Owner               | `apps/tg-news-reader`                                                                |
| Scope status        | scope_confirmed                                                                      |
| Interview questions | [Q06](#q06), [Q06a](#q06a), [Q07](#q07), [Q07a](#q07a), [Q07b](#q07b), [Q07c](#q07c) |

- [ ] The usage criterion is zero, one or two lifetime matches; rules with three or more matches do not qualify.
- [ ] Filters younger than 30 days from creation are excluded, even with zero matches.
- [ ] Only the current channel's filters qualify; other channels remain untouched even when their filters meet the same usage/age criteria.
- [ ] The operation exposes its current-channel scope and candidate count; bulk removals remain staged until Done.
- [ ] A selectable candidate preview allows excluding rules; only the selected candidates are staged for removal.
- [ ] Only the intended filters are removed and their news visibility is reconciled once.

### US04

**Create a keyword filter without inventing a separate descriptive name.**

| Field               | Value                 |
| ------------------- | --------------------- |
| Owner               | `apps/tg-news-reader` |
| Scope status        | scope_confirmed       |
| Interview questions | [Q10](#q10)           |

- [ ] Keyword appears first and is selected by default when creating a filter.
- [ ] A filter can be created with type and value but no separate name.
- [ ] Unnamed rules have an unambiguous label in lists and confirmations.
- [ ] Existing names remain intact; keyword matching remains a case-insensitive substring search in Telegram text.

### US05

**Track filter activity and automatically clean up stale rules under explicit retention rules.**

| Field               | Value                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Owner               | `apps/tg-news-reader`                                                                             |
| Scope status        | scope_confirmed                                                                                   |
| Interview questions | [Q06](#q06), [Q06a](#q06a), [Q08](#q08), [Q08a](#q08a), [Q08b](#q08b), [Q08c](#q08c), [Q09](#q09) |

- [ ] Creation, rule editing and last matching activity are distinguishable where required.
- [ ] The inactivity reference advances only when a new unique match is counted; editing, toggling and reprocessing already counted matches do not renew it.
- [ ] A filter with no matches uses its creation time as the inactivity reference.
- [ ] New, never-matched, disabled and unobserved filters follow explicit rules.
- [ ] Automatic cleanup uses explicitly agreed inactivity semantics, distinct from manual cleanup's lifetime-usage and minimum-age criteria.
- [ ] Eligible inactive filters are permanently deleted, not disabled or archived; retained news visibility is reconciled against the remaining rules.
- [ ] Automatic cleanup uses a 30-day inactivity cutoff and the agreed activity reference and observation requirements.
- [ ] No per-filter protection or exemption setting is introduced; all filters follow the common cleanup policy.
- [ ] Automatic cleanup runs only after a successful refresh of that channel, after evaluating its fetched news and recording qualifying activity.
- [ ] A failed refresh or an unrefreshed channel does not trigger automatic deletion.

### US06

**Find news by words and potentially by meaning, beyond the existing hashtag filter.**

| Field               | Value                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Owner               | `apps/tg-news-reader`                                                                               |
| Scope status        | scope_confirmed                                                                                     |
| Interview questions | [Q11](#q11), [Q11a](#q11a), [Q11b](#q11b), [Q11c](#q11c), [Q12](#q12), [Q12a](#q12a), [Q12b](#q12b) |

- [ ] The first version searches words and phrases without embeddings or semantic retrieval.
- [ ] Only Telegram post text is searched; a match found solely in loaded article content does not qualify.
- [ ] Matching results retain the feed's normal chronological order rather than relevance ranking.
- [ ] Steam Deck matches a contiguous case-insensitive substring, not separate occurrences of Steam and Deck; punctuation and quotes remain literal.
- [ ] Matching retained news beyond the first loaded page is discoverable.
- [ ] Search returns only retained news from the current channel and preserves its active read/unread and normal/hidden view.
- [ ] Matching text in other channels is not returned, even when those channels belong to the same owner or group.
- [ ] Text, tag and date intersect within the current channel and active read/hidden view.
- [ ] Search covers retained news only; read news removed on refresh is no longer searchable, and existing retention is unchanged.
- [ ] Semantic or hybrid search is outside the first version and requires later scope confirmation and representative relevance examples.

### US07

**Navigate news by sticky day separators and select a day; consider months later.**

| Field               | Value                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| Owner               | `apps/tg-news-reader`                                                 |
| Scope status        | scope_confirmed                                                       |
| Interview questions | [Q12](#q12), [Q12a](#q12a), [Q12b](#q12b), [Q13](#q13), [Q13a](#q13a) |

- [ ] Each publication day is separated using news publication time in the device timezone.
- [ ] A selected day spans local midnight to the next local midnight, including 23/25-hour days where daylight-saving transitions apply.
- [ ] Date navigation covers retained news only and does not add or reconstruct an archive of removed posts.
- [ ] The current day header stays accessible while scrolling on desktop and mobile.
- [ ] Clicking a header narrows the complete retained result set to that day, not just loaded rows.
- [ ] Pagination boundaries do not duplicate or lose day groups.
- [ ] Selecting a day preserves the current text query, tag and read/hidden view; all active conditions must match.
- [ ] Clearing the day removes only its date constraint and preserves the other active conditions.

### US08

**Generate the existing digest with Azure GPT-6 Luna while retaining a safe rollback path.**

| Field               | Value                    |
| ------------------- | ------------------------ |
| Owner               | `apps/tg-news-reader`    |
| Scope status        | scope_confirmed          |
| Interview questions | [Q15](#q15), [Q16](#q16) |

#### Latency target

| Field           | Value                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Max batch items | 50                                                                                             |
| Target seconds  | 120                                                                                            |
| Cache state     | uncached                                                                                       |
| Measurement     | Digest request start to completed text, including required article prefetch and excluding TTS. |

- [ ] A deliberately created Global Standard Luna deployment on the existing Sweden Central resource is selected through server configuration without replacing the old deployment.
- [ ] Existing citation, streaming, prefetch and batch contracts remain functional.
- [ ] Empty, refused, truncated or failed generation is not labelled a successful complete digest.
- [ ] Persisted digest results cannot be mistaken for output of a different generation configuration.
- [ ] Token usage, reasoning usage and latency can be inspected without logging news content or secrets.
- [ ] Representative uncached batches of up to 50 items complete within the 120-second target; time to first streamed text alone does not satisfy this criterion.
- [ ] Existing TTS remains unchanged; rollback selects the old text deployment with compatible parameters.
- [ ] Paid validation and production activation require separate explicit authorization.

## Cross-cutting acceptance

- [ ] Channel, active view, text, tag and date scope intersect rather than broadening one another.
- [ ] Search, tag and date scope must also constrain digest generation, bulk mark-read, undo and navigation.
- [ ] Empty scoped results must never become unscoped channel-wide actions.
- [ ] News policies, schemas, migrations and UI remain app-local; no shared runtime source imports this app.
- [ ] New UI text follows both English and Russian localization patterns.
- [ ] Tests use disposable or synthetic data, not live databases or copied private news.

## Non-goals

- Runtime implementation, resource creation, live paid model experiments, Git publication or production deployment in this planning task.
- Replacing TTS or implementing a generic multi-provider routing framework as part of the Luna migration.
- Treating public model rankings as proof of Russian digest quality or reasoning-max scores as low-effort scores.
- Adding a permanent news archive, vector database or monthly UI without the relevant scope decision.
- Silently deleting news or enabling automatic cleanup before its semantics are confirmed.
- AI-driven grouping, hiding, deletion or read-state changes in the normal news list; Q01 limits AI repetition handling to the digest.
- Remembering previous digests to suppress facts or maintain cross-digest topic history.
- Semantic/hybrid retrieval or embedding generation in the first search version.
- A durable archive of read/removed news, extended media retention or recovery of deleted posts as part of search/date navigation.

## Verified baseline

| Field    | Value                                                                                       |
| -------- | ------------------------------------------------------------------------------------------- |
| Observed | 2026-11-06                                                                                  |
| Basis    | Repository inspection and read-only Azure model/deployment metadata; no inference requests. |

### Filters

- Main FilterPanel immediately saves additions, deletions and active-state changes; each triggers channel reprocessing.
- TagBrowserModal already stages additions/deletions and applies them through one batch request.
- Filter statistics record daily matches during ingestion; reprocessing existing news does not update that history.
- Daily aggregates alone do not identify which individual news/filter matches were previously counted; exact legacy/backfill reconciliation requires a migration decision.
- The existing stats endpoint exposes lifetime hits, seven-day hits and last-hit date.
- Filter names are required; tag is currently the first and default authoring type.
- Keyword matching is a case-insensitive substring search in the Telegram text.

### Feed

- Hashtag narrowing operates on loaded pages, rather than a complete server-side matching result.
- News listing is paginated; desktop and mobile lists are virtualized.
- Refresh removes read news and their media; there is no durable complete read-news archive.

### Digest

- The prompt generally asks for related-topic grouping, not a persisted event/duplicate model.
- Large client digests use independent batches of 50 news items.
- Prompt inputs truncate Telegram text to 500 characters and loaded articles to a configurable limit.
- Completed batch results are persisted without model or generation-setting identity.
- The server uses a dated Azure API, max_tokens and temperature; completion reasons are not currently checked.

### Azure deployment and billing context

| Field                   | Value                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Resource region         | swedencentral                                                                                           |
| Current text deployment | gpt-4o-mini                                                                                             |
| Actual text model       | gpt-4.1-mini                                                                                            |
| Actual text version     | 2025-04-14                                                                                              |
| Current text retirement | 2027-04-14                                                                                              |
| Current text sku        | Standard                                                                                                |
| Current voice model     | tts                                                                                                     |
| Current voice version   | 001                                                                                                     |
| Luna model              | gpt-6-luna                                                                                              |
| Advertised luna version | 2026-09-22                                                                                              |
| Availability limit      | Model listing advertises GlobalStandard and DataZoneStandard; usable quota and capacity are not proven. |
| Credit context          | Owner reports approximately EUR 120 in monthly Azure credits shared with the rest of the subscription.  |
| Subscription context    | Visual Studio Enterprise / MSDN with a spending limit enabled.                                          |

## Interview record

| Field            | Value                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Status           | completed                                                                                                    |
| Completed        | 2026-11-06                                                                                                   |
| Mode             | One question per chat turn, numbered choices plus a free-form alternative.                                   |
| Current question | None                                                                                                         |
| Recording rule   | Record the answer and its date, update affected decisions and criteria, then ask the next relevant question. |
| Unanswered rule  | Do not promote an assistant recommendation or unanswered option to a confirmed requirement.                  |

All 32 answers are recorded below in conversation order. Question IDs are preserved; letter suffixes identify follow-up questions rather than additional unanswered requirements.

| #   | Question      | Answered   | Choice | Recorded answer                                                                                                                                     |
| --- | ------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [Q01](#q01)   | 2026-11-06 | 1      | Digest only; original news cards remain unchanged.                                                                                                  |
| 2   | [Q02](#q02)   | 2026-11-06 | 2      | One game/topic block containing all distinct updates, with repeated facts merged.                                                                   |
| 3   | [Q03](#q03)   | 2026-11-06 | 2      | Also omit advertising and clear spam; retain substantive unique news.                                                                               |
| 4   | [Q04](#q04)   | 2026-11-06 | 1      | Current digest only; group all its selected inputs without remembering previous digests.                                                            |
| 5   | [Q05](#q05)   | 2026-11-06 | 1      | Save the staged rules and reprocess all retained channel news once.                                                                                 |
| 6   | [Q05b](#q05b) | 2026-11-06 | 3      | Ask whether to apply changes, discard them or continue editing before closing.                                                                      |
| 7   | [Q05a](#q05a) | 2026-11-06 | 1      | All filter-editor changes wait for Done, including active switches and the forwards setting.                                                        |
| 8   | [Q05c](#q05c) | 2026-11-06 | 2      | Save the quick-added rule immediately and reprocess the channel, as an exception to the staged editor.                                              |
| 9   | [Q06](#q06)   | 2026-11-06 | 2      | Lifetime count of unique news matched by the filter, retained even after the news is removed.                                                       |
| 10  | [Q06a](#q06a) | 2026-11-06 | 1      | Its lifetime count immediately becomes 20; repeated Done without new matches does not increase it.                                                  |
| 11  | [Q07](#q07)   | 2026-11-06 | 1      | Zero, one or two lifetime matches.                                                                                                                  |
| 12  | [Q07a](#q07a) | 2026-11-06 | 1      | Exclude filters created less than 30 days ago from manual low-use cleanup.                                                                          |
| 13  | [Q07b](#q07b) | 2026-11-06 | 1      | Current channel only, through its filter-management window.                                                                                         |
| 14  | [Q07c](#q07c) | 2026-11-06 | 1      | Preview candidates, allow exclusions and stage the selected removals; Done commits them.                                                            |
| 15  | [Q08](#q08)   | 2026-11-06 | 1      | Permanently delete eligible inactive filters.                                                                                                       |
| 16  | [Q08a](#q08a) | 2026-11-06 | 1      | 30 days without qualifying matching activity.                                                                                                       |
| 17  | [Q08b](#q08b) | 2026-11-06 | 1      | Wait for the next successful channel refresh, evaluate its news first and only then consider cleanup; a failed refresh does not permit cleanup.     |
| 18  | [Q08c](#q08c) | 2026-11-06 | 2      | Apply the same automatic cleanup policy to every filter without per-filter exemptions.                                                              |
| 19  | [Q09](#q09)   | 2026-11-06 | 1      | Only newly counted unique news matches update activity; edits and active switches do not.                                                           |
| 20  | [Q10](#q10)   | 2026-11-06 | 1      | Keyword is first and selected by default.                                                                                                           |
| 21  | [Q11](#q11)   | 2026-11-06 | 1      | Word/phrase search first; semantic search is deferred to later work.                                                                                |
| 22  | [Q11a](#q11a) | 2026-11-06 | 1      | Search only Telegram post text.                                                                                                                     |
| 23  | [Q11b](#q11b) | 2026-11-06 | 1      | Preserve the feed's normal chronological order; search only narrows the result set.                                                                 |
| 24  | [Q11c](#q11c) | 2026-11-06 | 1      | Treat the entire query as one literal substring; Steam Deck must occur contiguously, like browser Find.                                             |
| 25  | [Q12](#q12)   | 2026-11-06 | 1      | Search only news still retained by the app; do not add a read-news archive.                                                                         |
| 26  | [Q12a](#q12a) | 2026-11-06 | 1      | Current channel only.                                                                                                                               |
| 27  | [Q12b](#q12b) | 2026-11-06 | 1      | Respect the current read/unread and normal/hidden view; search only narrows that view.                                                              |
| 28  | [Q13](#q13)   | 2026-11-06 | 1      | Use the device's timezone for publication-day boundaries.                                                                                           |
| 29  | [Q13a](#q13a) | 2026-11-06 | 1      | Preserve the active text query and tag; day, text and tag narrow results together.                                                                  |
| 30  | [Q14](#q14)   | 2026-11-06 | 1      | Luna digest migration is the first-priority track; no full ordering of the remaining tracks was provided.                                           |
| 31  | [Q15](#q15)   | 2026-11-06 | 1      | Global Standard, with model requests routed through Azure's global inference infrastructure.                                                        |
| 32  | [Q16](#q16)   | 2026-11-06 | 2      | Up to two minutes for the fully completed uncached text of one batch of up to 50 news items, including required article prefetch and excluding TTS. |

## Questions and original alternatives

### Q01

**AI surface** (answered). Should AI grouping change the digest, the normal news list, or both?

1. **Choice 1 (selected):** Digest only; original news cards remain unchanged.
1. **Choice 2:** News list only; group or collapse cards there.
1. **Choice 3:** Both digest and news list.

### Q02

**Group identity** (answered). Distinguish a repeated event from separate updates about the same game or broad topic.

**Example:** One digest contains a game announcement, a later trailer and a release-date announcement.

1. **Choice 1:** Three separate event entries; merge only repetitions of the same event.
1. **Choice 2 (selected):** One game/topic block containing all distinct updates, with repeated facts merged.

### Q03

**AI action** (answered). Within the digest, merge repeated facts only or also omit advertising/spam or lower-importance news?

1. **Choice 1:** Merge repetitions only; retain all unique news facts.
1. **Choice 2 (selected):** Also omit advertising and clear spam; retain substantive unique news.
1. **Choice 3:** Also select news by importance; AI may omit lower-importance unique items.

### Q04

**Digest comparison scope** (answered). Group only the selected news in the current digest, across all its batches, or also use previous digests?

1. **Choice 1 (selected):** Current digest only; group all its selected inputs without remembering previous digests.
1. **Choice 2:** Also remember previous digests to avoid retelling known facts and emphasize new developments.

### Q05

**Done application scope** (answered). On Done, reprocess retained channel news once or apply the saved rules only to future arrivals?

1. **Choice 1 (selected):** Save the staged rules and reprocess all retained channel news once.
1. **Choice 2:** Save the staged rules for future arrivals without reprocessing retained news.

### Q05a

**Staged filter changes** (answered). Does Done stage all filter-editor changes, including active switches and the forwards setting, or only additions/removals?

1. **Choice 1 (selected):** All filter-editor changes wait for Done, including active switches and the forwards setting.
1. **Choice 2:** Only additions/removals wait for Done; active switches and the forwards setting apply immediately.

### Q05b

**Closing without Done** (answered). Does closing discard staged edits, preserve a draft or ask whether to apply them?

1. **Choice 1:** Discard unapplied edits when closing without Done.
1. **Choice 2:** Preserve an unapplied draft for the next time the filter editor opens.
1. **Choice 3 (selected):** Ask whether to apply changes, discard them or continue editing before closing.

### Q05c

**Quick filter actions** (answered). Should Add Filter from a news hashtag open a prefilled staged filter editor or apply immediately as an explicit exception?

1. **Choice 1:** Open the filter editor with the rule added to its draft; apply through Done.
1. **Choice 2 (selected):** Save the quick-added rule immediately and reprocess the channel, as an exception to the staged editor.

### Q06

**Displayed filter usage** (answered). Show current matching retained-news counts, lifetime matching-news counts or both?

1. **Choice 1:** Current count of retained news matching the filter condition.
1. **Choice 2 (selected):** Lifetime count of unique news matched by the filter, retained even after the news is removed.
1. **Choice 3:** Show both current matching retained news and lifetime unique matches, with distinct labels.

### Q06a

**Counting matches in retained news** (answered). Should applying a newly created filter count matches in already retained news or only future arrivals?

**Example:** A newly created filter matches 20 retained news items when Done is applied.

1. **Choice 1 (selected):** Its lifetime count immediately becomes 20; repeated Done without new matches does not increase it.
1. **Choice 2:** Its lifetime count stays zero until matching future news arrives.

### Q07

**Low-use threshold** (answered). Which lifetime usage counts qualify a filter for manual bulk cleanup?

1. **Choice 1 (selected):** Zero, one or two lifetime matches.
1. **Choice 2:** One or two lifetime matches; exclude zero-match rules.

### Q07a

**New-rule protection** (answered). Should manual low-use cleanup protect recently created filters, and for how long?

1. **Choice 1 (selected):** Exclude filters created less than 30 days ago from manual low-use cleanup.
1. **Choice 2:** Apply no minimum-age protection; even a new filter with zero to two matches can qualify.

### Q07b

**Bulk cleanup scope** (answered). Should bulk cleanup target the current channel or filters across multiple channels?

1. **Choice 1 (selected):** Current channel only, through its filter-management window.
1. **Choice 2:** All channels owned by the user, through a global cleanup action.

### Q07c

**Bulk removal selection** (answered). Show a selectable candidate preview or immediately stage all eligible rules for removal, with both paths committing only on Done?

1. **Choice 1 (selected):** Preview candidates, allow exclusions and stage the selected removals; Done commits them.
1. **Choice 2:** Stage all eligible removals immediately without a separate preview; Done commits them.

### Q08

**Automatic cleanup action** (answered). Should automatic cleanup permanently delete inactive filters or disable them while keeping them available for reactivation?

1. **Choice 1 (selected):** Permanently delete eligible inactive filters.
1. **Choice 2:** Disable eligible inactive filters but retain them for possible reactivation.

### Q08a

**Automatic inactivity period** (answered). How long without qualifying matching activity makes a filter eligible for automatic cleanup?

1. **Choice 1 (selected):** 30 days without qualifying matching activity.
1. **Choice 2:** 90 days without qualifying matching activity.
1. **Choice 3:** 180 days without qualifying matching activity.

### Q08b

**Channels without observations** (answered). Require a successful channel refresh before cleanup or allow calendar-based cleanup of an unrefreshed channel?

1. **Choice 1 (selected):** Wait for the next successful channel refresh, evaluate its news first and only then consider cleanup; a failed refresh does not permit cleanup.
1. **Choice 2:** Allow cleanup after 30 calendar days without matches even if the channel has not been refreshed.

### Q08c

**Automatic cleanup exemptions** (answered). Should important rare-use filters have an explicit exemption from automatic cleanup?

1. **Choice 1:** Provide a per-filter Do not delete automatically flag for protecting important rare-use rules.
1. **Choice 2 (selected):** Apply the same automatic cleanup policy to every filter without per-filter exemptions.

### Q09

**Filter timestamps** (answered). Does the last-activity date for automatic cleanup advance only on a newly counted match or also on saved filter changes?

1. **Choice 1 (selected):** Only newly counted unique news matches update activity; edits and active switches do not.
1. **Choice 2:** Newly counted unique news matches and any saved changes to the filter update activity, including active switches.

**Common rules:**

- Before any qualifying activity, count inactivity from filter creation.
- Repeated Done without new matches or saved changes does not renew activity.

### Q10

**Keyword authoring** (answered). Should keyword be both first and selected by default, or first while tag remains selected by default?

1. **Choice 1 (selected):** Keyword is first and selected by default.
1. **Choice 2:** Keyword is first, but tag remains selected by default.

### Q11

**First-version search** (answered). Deliver word/phrase search first and defer semantic retrieval, or include hybrid lexical/semantic search in the first version?

1. **Choice 1 (selected):** Word/phrase search first; semantic search is deferred to later work.
1. **Choice 2:** Hybrid search in the first version, combining exact words and semantic matches without requiring the same wording.

### Q11a

**Searchable fields** (answered). Search Telegram post text only or also stored full article content?

1. **Choice 1 (selected):** Search only Telegram post text.
1. **Choice 2:** Search Telegram post text and full article content already loaded and stored by the app.

### Q11b

**Search result ordering** (answered). Keep the feed's chronological order or rank matching search results by relevance?

1. **Choice 1 (selected):** Preserve the feed's normal chronological order; search only narrows the result set.
1. **Choice 2:** Rank matching results by relevance, with the strongest matches first.

### Q11c

**Word and phrase matching** (answered). Use case-insensitive literal substring matching or token-based words with quoted phrases?

**Example:** Search for Steam Deck.

1. **Choice 1 (selected):** Treat the entire query as one literal substring; Steam Deck must occur contiguously, like browser Find.
1. **Choice 2:** Require all complete query words anywhere in the post, regardless of order; double quotes request a contiguous phrase.

**Common rules:**

- Matching is case-insensitive in both variants.

### Q12

**Searchable history** (answered). Search retained news only or change retention to keep a durable searchable archive of read news?

**Baseline:** Read news is currently removed on channel refresh; adding search cannot by itself recover deleted records.

1. **Choice 1 (selected):** Search only news still retained by the app; do not add a read-news archive.
1. **Choice 2:** Change retention to preserve read news for future archive searches; define that scope separately.

### Q12a

**Search scope** (answered). Search within the current channel, current group or all channels owned by the user?

1. **Choice 1 (selected):** Current channel only.
1. **Choice 2:** Current group/folder of channels.
1. **Choice 3:** All channels owned by the user.

### Q12b

**Search visibility** (answered). Respect the active read/hidden view or search all retained states with an explicit indication of scope?

1. **Choice 1 (selected):** Respect the current read/unread and normal/hidden view; search only narrows that view.
1. **Choice 2:** Search all retained news in the current channel, including read and filter-hidden news regardless of the active view.

### Q13

**Publication-day timezone** (answered). Determine publication days in the device timezone or always in Europe/Prague?

1. **Choice 1 (selected):** Use the device's timezone for publication-day boundaries.
1. **Choice 2:** Always use Europe/Prague so day boundaries are identical across devices.

**Common rules:**

- Use the news publication timestamp, not its download/ingestion time.

### Q13a

**Day selection and other conditions** (answered). When a day header is clicked, preserve active word/tag conditions or clear them to show that day alone?

1. **Choice 1 (selected):** Preserve the active text query and tag; day, text and tag narrow results together.
1. **Choice 2:** Clear the text query and tag when selecting a day.

**Common rules:**

- Preserve the current read/unread and normal/hidden view in either variant.

### Q14

**Delivery priority** (answered). Which delivery track should be first in the plan?

**Accepted formats:** One first-choice ID, or an ordered list of track IDs for a complete ranking.

1. **Choice 1 (selected):** Luna digest migration.
1. **Choice 2:** Filter management, statistics, keyword authoring and cleanup.
1. **Choice 3:** Text search and day navigation.
1. **Choice 4:** Digest game/topic grouping and advertising/spam omission.

### Q15

**Luna inference geography** (answered). Choose Global Standard or EU Data Zone; Sweden resource location alone does not impose inference residency.

1. **Choice 1 (selected):** Global Standard, with model requests routed through Azure's global inference infrastructure.
1. **Choice 2:** EU Data Zone Standard, with model inference confined to Azure's European data zone.

**Common rules:**

- Plan to retain the existing resource in Sweden Central; deployment routing does not relocate that resource.
- Actual quota/capacity is unverified for either choice and must be checked before deployment.

### Q16

**Luna completed-batch latency** (answered). What is the target waiting-time limit for a fully completed uncached digest batch of up to 50 news items?

1. **Choice 1:** Up to one minute. Target: 60 seconds.
1. **Choice 2 (selected):** Up to two minutes. Target: 120 seconds.
1. **Choice 3:** Up to three minutes. Target: 180 seconds.

**Common rules:**

- Measure from starting the digest request to completed text, including article prefetch where needed, not just time to first streamed text.
- Exclude TTS/audio generation and do not claim a percentile or service SLA from a small control set.

**Paid validation gate:** No paid runs are authorized; agree an explicit request/token/spend cap before live validation.

## References

- [apps/tg-news-reader/AGENTS.md](../../apps/tg-news-reader/AGENTS.md)
- [apps/tg-news-reader/ROADMAP.md](../../apps/tg-news-reader/ROADMAP.md)
- [apps/tg-news-reader/docs/architecture.md](../../apps/tg-news-reader/docs/architecture.md)
- [https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle)
- [https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule)
- [https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-claude#subscription-type-and-region-support](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-claude#subscription-type-and-region-support)
