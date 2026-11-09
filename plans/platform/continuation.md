# personal-hub continuation plan

**Dated continuation handoff, not a live status report. Inspect current Git state before choosing work; historical validation and deployment observations retain their original dates.**

Converted from YAML to Markdown on 2026-11-09 at the owner's request. Original decisions, authorization boundaries and observation dates are preserved.

| Field           | Value                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Updated         | 2026-10-20                                                                                                                        |
| Purpose         | Continue repository work without access to the originating Scout conversation.                                                    |
| Path convention | Repository-relative unless explicitly described as a sibling directory.                                                           |
| Status          | Monorepo news production cutover completed successfully; old deployment disabled and one healthy new replica serving all traffic. |

## Continuation

- Read the relevant application guidance and linked plan for the user's chosen task.
- Inspect current Git state and package scripts instead of repeating migration setup.
- Update this handoff when a decision, remaining milestone or known limitation materially changes.
- Keep product requirements in their linked plans; do not duplicate them here.
- No Scout tools, chat history or session-local files are required to continue.

## Decisions

- One repository, independently runnable applications; not a combined backend or deployment.
- Keep npm workspaces and one root lockfile; add orchestration tooling only for a demonstrated need.
- Share reusable behavior, not product schemas or every similarly named file.
- Shared authentication implementation does not mean shared users, sessions, databases or SSO.
- Preserve original application histories and runtime data as reference and recovery sources.
- personal-hub is public; the standalone tg-news-reader repository is private.
- Commit/push/PR publication requires explicit authorization; owner PR auto-merge and automatic news deployment after successful main CI were explicitly authorized on October 20, 2026.
- Use dev/dshilov/* for working branches.
- Current source code and scripts are authoritative; historical plans describe intent, not completion.

## Applications

### News

| Field            | Value                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Directory        | apps/tg-news-reader                                                                                                       |
| State            | Main working product; migrated to shared browser and authentication modules.                                              |
| Priority         | Primary reference for functional regression and local acceptance.                                                         |
| Local acceptance | User reported on October 2 that tg-news-reader works locally; individual workflows and data coverage were not enumerated. |
| Remaining        | Routine owner acceptance of live reading/media/auth workflows; production cutover is complete.                            |

#### Entry points

- [apps/tg-news-reader/AGENTS.md](../../apps/tg-news-reader/AGENTS.md)
- [apps/tg-news-reader/README.md](../../apps/tg-news-reader/README.md)
- [apps/tg-news-reader/ROADMAP.md](../../apps/tg-news-reader/ROADMAP.md)
- [plans/tg-news-reader/prd.md](../tg-news-reader/prd.md)
- [plans/tg-news-reader/implementation.md](../tg-news-reader/implementation.md)

#### Planning update

| Field               | Value                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observed            | 2026-11-09                                                                                                                                                  |
| State               | Local requirements and slices converted to Markdown; all 32 product-interview answers are preserved and implementation has not started.                     |
| Confirmed direction | Prioritize Azure GPT-6 Luna migration within the news plan; this is not implementation or production authorization.                                         |
| Interview state     | Completed; see the Interview record section in plans/tg-news-reader/prd.md.                                                                                 |
| Execution           | Documentation-only commit, push and PR authorized on 2026-11-09; no runtime changes, resource creation, paid inference or production activation authorized. |

#### Container contract

| Field             | Value                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision          | Preserve the standalone runtime paths instead of changing Azure mounts for the monorepo layout.                                             |
| Working directory | /app                                                                                                                                        |
| Entry point       | /app/dist/server/index.js                                                                                                                   |
| Data mount        | /app/data                                                                                                                                   |
| Port              | 3173                                                                                                                                        |
| Local validation  | Image rebuilt; network-isolated checks passed for static/version/shared imports and retained SQLite/media in a disposable /app/data volume. |

### Czech

| Field              | Value                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Directory          | apps/czech-learning                                                                                                                                                                                                |
| State              | Early prototype, not a mature product whose entire UI must be preserved.                                                                                                                                           |
| User clarification | On 2026-09-30 the user clarified that little data exists and most work concerned word recognition. Significant redesign or a fresh application is under consideration, not yet a decision to delete or rewrite it. |
| Preserve           | Useful OCR/import work, source examples and recognized vocabulary.                                                                                                                                                 |
| Approach           | Leave the imported prototype available. Clarify the intended learning workflow before investing in old UI polish or a rewrite. Reuse the platform where appropriate; do not migrate users/data just for parity.    |
| Historical plan    | [plans/czech-learning/czech-learning-app.md](../czech-learning/czech-learning-app.md)                                                                                                                              |

### Cv

| Field     | Value                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| Directory | apps/dmitriishilov.com                                                                             |
| State     | Existing Astro/Alpine/Tailwind site published as source in the monorepo; hosting is not activated. |
| Approach  | Keep independent of React UI and shared authentication.                                            |
| Remaining | Visual/mobile/print review; existing PDF was copied, not regenerated.                              |

#### Entry points

- [apps/dmitriishilov.com/README.md](../../apps/dmitriishilov.com/README.md)
- [plans/dmitriishilov.com/prd-cv-site.md](../dmitriishilov.com/prd-cv-site.md)
- [plans/dmitriishilov.com/cv-site.md](../dmitriishilov.com/cv-site.md)

### Music

| Field                   | Value                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory               | apps/music-discovery                                                                                                                                                                  |
| State                   | Plans-only placeholder; no package.json, runtime, dependencies or provider calls.                                                                                                     |
| Naming                  | VK Music Discovery is the confirmed display name; music-discovery remains the technical directory.                                                                                    |
| Product scope confirmed | 2026-10-05                                                                                                                                                                            |
| Planning status         | Detailed PRD confirmed; owner authorized local implementation on October 5. Provider feasibility is blocked; runtime work is not started.                                             |
| Remaining               | Establish VK permission for transferring wall.get text to Azure and clarify Spotify integration policy, then verify authorized VK/Spotify/Azure access before implementing ingestion. |
| Distinction             | Opening a Spotify album is not a guarantee of automatic playback.                                                                                                                     |

#### Entry points

- [plans/music-discovery/prd.md](../music-discovery/prd.md)
- [plans/music-discovery/implementation.md](../music-discovery/implementation.md)

## Suggested next work

| Field          | Value                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Interpretation | These are continuation options, not authorization to run every step. Follow the user's selected task and resolve its prerequisites first. |

### Items

#### news-local-acceptance

| Field     | Value                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| State     | user_reported_working                                                             |
| Done when | Representative news workflows work locally without changing the old installation. |

##### Work

- [ ] Review the current diff and news setup instructions.
- [ ] Agree whether to use an empty local database or an isolated copy of existing data.
- [ ] If copying data, use a consistent database snapshot; migrate only the copy.
- [ ] Configure a separate local Telegram session when the user is ready to authenticate.
- [ ] Exercise channels, reading state, media, login/refresh and the update banner.

##### Guardrails

- Never point the new application at the original or production database by default.
- Never reuse the active production TG_SESSION in a second running client.
- Keep secrets out of repository files, logs and chat transcripts.

#### cv-visual-acceptance

| Field     | Value                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| State     | pending                                                                           |
| Done when | User accepts the site and print output or concrete follow-up issues are recorded. |

##### Work

- [ ] Start the CV workspace using its documented local command.
- [ ] Review desktop/mobile appearance, links and print layout.
- [ ] Regenerate the PDF only as an explicit task; preserve the existing artifact otherwise.

#### music-provider-feasibility

| Field       | Value                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State       | blocked_on_vk_transfer_permission_spotify_policy_and_live_access                                                                                          |
| Plan        | [plans/music-discovery/implementation.md](../music-discovery/implementation.md)                                                                           |
| First slice | provider-feasibility                                                                                                                                      |
| Done when   | Permitted VK, Spotify and Azure access works for the sources already selected in the PRD, with usage-policy constraints resolved or a blocker documented. |

#### czech-product-direction

| Field     | Value                                                                                |
| --------- | ------------------------------------------------------------------------------------ |
| State     | awaiting_product_decision                                                            |
| Done when | A scoped next slice is agreed without assuming the historical plan is still desired. |

##### Work

- [ ] Review existing recognition/import results and a few representative examples.
- [ ] Agree the first useful end-to-end learning workflow.
- [ ] Choose targeted reuse versus rebuilding the product UI/domain implementation.

#### container-acceptance

| Field     | Value                                                                                    |
| --------- | ---------------------------------------------------------------------------------------- |
| State     | image_builds_passed_runtime_acceptance_pending                                           |
| Done when | Actual Linux containers run independently; Windows layout checks alone are insufficient. |

##### Work

- [ ] Both Linux images built and disposable network-isolated runtime smoke checks passed on October 2.
- [ ] Exercise representative app workflows using isolated configuration/data before production activation.

#### publication-decision

| Field     | Value                                                                                    |
| --------- | ---------------------------------------------------------------------------------------- |
| State     | workflows_and_runtime_compatibility_merged                                               |
| Guardrail | Archived deployment workflows are historical reference, not runnable setup instructions. |

##### Work

- [ ] Workflow PR 2 is merged and main CI has passed; required aggregate protection is enforced.
- [ ] Runtime compatibility PR 3 is merged; main CI run 37025261293 passed.
- [ ] News production cutover completed in run 37032087106; other apps remain independent and are not deployed by this workflow.

## Automation update

| Field                  | Value                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observed               | 2026-10-20                                                                                                                                                                                                            |
| Authorization          | Owner explicitly approved enabling owner PR auto-merge and automatic news production deployment.                                                                                                                      |
| AUTO MERGE OWNER PRS   | true                                                                                                                                                                                                                  |
| Owner pr               | PR 5 auto-merged as 2d56e14775a54c1c0602a2f5a477b12a9774da63; downstream main CI dispatched.                                                                                                                          |
| Production environment | Required reviewers removed; main-only branch policy and disabled admin bypass preserved.                                                                                                                              |
| Deployment policy      | Relevant successful current-main CI deploys automatically; failed CI still blocks deployment.                                                                                                                         |
| Current blocker        | PR 8 diagnostics confirmed HTTP 401 when reading the legacy source workflow. This detachment removes that dependency; deployment success must be checked separately. The bot-dispatched CI event-chain issue remains. |
| Ci fix                 | PR 7 merged as b12a7ee; LoginPage timer cleanup fixed the main CI failure. All 112 news test files / 1348 tests passed locally, and hosted CI passed.                                                                 |
| Diagnostics            | PR 8 merged as 4e137a7; safe guard stage/status diagnostics identified the legacy SOURCE_PAT failure.                                                                                                                 |
| Other pull requests    | PRs 1-5, 7 and 8 are merged. Dependabot PR 6 (shell-quote and concurrently) remains open with successful original CI; owner-only auto-merge does not cover bot PRs.                                                   |
| History note           | The October 2 snapshots below retain initial rollout settings; this update supersedes their pending auto-merge activation, per-deployment approval and renewable source-PAT requirements.                             |

### Legacy detachment

| Field                      | Value                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization              | Owner explicitly requested disabling all Actions in the old repository and fully detaching personal-hub.                                                               |
| Source repository          | bk201-/tg-news-reader                                                                                                                                                  |
| Repository actions enabled | false                                                                                                                                                                  |
| Ordinary workflows         | Build Main, PR Check and the one-time transfer workflow are disabled_manually.                                                                                         |
| System workflow note       | GitHub refuses individual disabling of its managed Dependabot Updates workflow (HTTP 422); repository-wide Actions are disabled.                                       |
| Outstanding runs           | queued=0, in_progress=0, waiting=0, pending=0, requested=0 after disabling Actions.                                                                                    |
| Secret                     | PAT_TOKEN removed from personal-hub; no credential values read or changed elsewhere.                                                                                   |
| Implementation             | Guard and workflow no longer require a legacy token or call the legacy repository; current-main CI, cutover mode, Azure compatibility and replica-drain checks remain. |
| Validation                 | 202 automation tests passed, including target-only requests without legacy credentials and fail-closed CI/cutover checks.                                              |
| Publication                | Owner authorized publishing and merging this detachment through a protected-main PR on October 20; deployment outcome must be checked separately.                      |

## Snapshot

| Field          | Value                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Observed       | 2026-10-02                                                                                                                                                                                                                     |
| Branch         | main                                                                                                                                                                                                                           |
| Head           | 2259423                                                                                                                                                                                                                        |
| History note   | Six unpublished migration commits were rewritten to GitHub noreply before first publication; original news ancestry was retained.                                                                                              |
| Interpretation | This is a dated handoff, not a live Git status report. Inspect the current branch and diff before changing anything. Existing uncommitted work is intentional; preserve it rather than recreating imports or cleaning it away. |

### Committed

- 8aa4248: news relocation with original main ancestry retained.
- aabf3ca: Czech current-worktree baseline, not its unborn repository index.
- 6e68e57: isolated workspaces and shared browser/auth modules.
- db9a4b2: adapted documentation, plans, skills and inactive deployment archives.
- f01c0a2: monorepo snapshot including CV, music plans and tooling upgrades.
- 9cac36f: restored PR skill and organized gitignore; published on main.
- 142bcd2: workspace CI, owner automation and gated news deployment; published in PR 2.
- a42885f: PR 2 squash-merged after explicit approval; main CI passed.
- 9680a33: dependency update merged separately; preserved as the compatibility change baseline.
- f462998: PR 3 merged; legacy news runtime compatibility published and main CI passed.
- 2259423: PR 4 merged; pre-downtime historical replica verification published and main CI passed.

### Pending

- Keep the old deploy disabled; future relevant current-main deployments require protected-environment approval.
- Owner auto-merge activation and personal-account Copilot access remain separate decisions.

## Github repository

| Field                 | Value                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Configured            | 2026-10-01                                                                                        |
| Url                   | https://github.com/bk201-/personal-hub                                                            |
| Visibility            | public                                                                                            |
| Local remote          | origin                                                                                            |
| State                 | main protected with required CI; native auto-merge enabled; twelve legacy Actions secrets copied. |
| Workflow pull request | https://github.com/bk201-/personal-hub/pull/2                                                     |
| Source settings       | bk201-/tg-news-reader                                                                             |

### Matched

- Merge methods, merge commit messages and merged-branch retention.
- Issues, projects, wiki and discussions disabled.
- Actions enabled with read-only default token permissions and no PR review approval permission.
- Dependabot vulnerability alerts and security updates enabled.
- Source dependency labels added; the new default accessibility label retained.
- Cloud-agent settings were copied on October 1; repository access still needs separate confirmation.

### Intentional differences

- The source repository is now private; personal-hub is public.
- Protect main ruleset 24365619 requires PRs with zero approvals and resolved review threads, blocks deletion/force-push and has no bypass actors.
- Build & Lint is required from GitHub Actions app 15368, with strict up-to-date branches, after a successful hosted run.
- Legacy Build Main is disabled and drained; monorepo news deployment is active with required environment approval.
- Secret scanning and push protection were enabled for the public monorepo on October 2.

### Pending

- Main CI has passed; enable AUTO_MERGE_OWNER_PRS only when the explicit downstream-dispatch path is accepted.
- Confirm personal-account Copilot repository access; matching cloud-agent configuration does not prove access.
- Renew the source-reading PAT before expiry; do not re-enable the old deploy alongside the monorepo.

### Guardrails

- The twelve source secrets were copied through a destination-encrypted handoff; no values were exposed or token permissions expanded.
- The temporary transfer branch/artifact were deleted and its workflow disabled; source main and runtime were not changed.
- Keep production deployment off until explicit cutover authorization; secret presence is not deployment permission.

## Production cutover

| Field                  | Value                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observed               | 2026-10-02                                                                                                                                           |
| Authorization          | User approved the singleton cutover, then explicitly approved correcting the drain algorithm through commit, push, PR and merge before continuing.   |
| State                  | Completed successfully; source workflow remains disabled and new protected deployment is enabled.                                                    |
| Successful run         | https://github.com/bk201-/personal-hub/actions/runs/37032087106                                                                                      |
| Deployment id          | 6812802844                                                                                                                                           |
| Deployed sha           | 2259423aca8302abd30a0e5f15f65e17655291dc                                                                                                             |
| Environment success at | 2026-10-02T16:20:18Z                                                                                                                                 |
| Acceptance limit       | Production health/version and actual replica/traffic state confirmed; no authenticated user-interface workflow or manual data restore was exercised. |

### Environment

| Field             | Value                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Name              | tg-news-reader-production                                                                                                                      |
| Id                | 23311119030                                                                                                                                    |
| Required reviewer | bk201-                                                                                                                                         |
| Branch policy     | Only the main branch; no tag policy.                                                                                                           |
| Admin bypass      | false                                                                                                                                          |
| Self review       | Allowed for the single-owner repository; both initial and successful retry runs approved under explicit operator authorization without bypass. |

### Azure

| Field                 | Value                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Subscription          | f7758f68-5127-4e40-b8bf-3bd367b448a9                                                                              |
| Resource group        | personal-apps-rg                                                                                                  |
| App                   | tg-news-reader                                                                                                    |
| Active revision       | tg-news-reader--r2259423a-37032087106-1                                                                           |
| Deployed image digest | sha256:5c2d7c9729fb67881907bd022f969be75b50fa0f10e313f9c08aad1ad68771c0                                           |
| Old revision          | tg-news-reader--rdc977a55                                                                                         |
| Old revision state    | Inactive; actual replica list confirmed empty after cutover.                                                      |
| New revision state    | Healthy, exactly one Running replica, 100 percent ingress traffic.                                                |
| Runtime               | One healthy replica, Single mode, min=max=1, external port 3173, image-default command, Azure Files at /app/data. |
| Health                | Database OK; Telegram session not expired and connection not delayed.                                             |
| Version               | 1.34.2                                                                                                            |
| Build id              | tg-news-reader:83ddf40e-ff35-4a86-8db5-655ae44a7d41                                                               |

### Recovery

| Field                | Value                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Image                | personalapps-hpebd4enbyftf4c2.azurecr.io/tg-news-reader:dc977a5538269498817b977e8993e2f4c8694cf5                       |
| Digest               | sha256:fded7a166c6296aa003f310188113a3d6e824fc6c0d04e79ffc49c3ecedbad27                                                |
| Database             | Remote Turso, not SQLite on the mounted share.                                                                         |
| Schema compatibility | schema.ts, migrate.ts and downloadsMigration.ts have identical Git blobs in the running commit and f462998.            |
| Rollback rule        | Stop and prove all new replicas drained before reactivating the retained old revision; never overlap Telegram clients. |

#### Database backup

| Field                  | Value                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Method                 | Read-only embedded-replica sync, closed remote connection, then SQLite backup from the local replica.                                   |
| Storage account        | tgnewsreadermedia                                                                                                                       |
| Private blob container | tg-news-reader-recovery                                                                                                                 |
| Blob                   | pre-monorepo-2026-10-02T15-43-28.687Z.sqlite                                                                                            |
| Sha256                 | b1f91d66f878a18716747a11ff3d398cb4395078eb919f595d8d5040cc7c15f9                                                                        |
| Validation             | Downloaded the stored copy, matched its SHA256 and opened it offline; PRAGMA integrity_check returned ok.                               |
| Privacy                | No database contents or credentials logged; temporary local copies removed; no Telegram client or application server started.           |
| Limitation             | This is a pre-cutover recovery copy, not PITR or a transactional snapshot spanning both Turso and media. No live restore was performed. |

#### Media snapshot

| Field     | Value                                                                       |
| --------- | --------------------------------------------------------------------------- |
| Account   | tgnewsreadermedia                                                           |
| Share     | tgr-media                                                                   |
| Timestamp | 2026-10-02T15:32:26.0000000Z                                                |
| State     | Created and confirmed present; retained privately in Azure, not downloaded. |

### Drain correction

| Field            | Value                                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original finding | azure.mjs sequentially queried actual replicas for every retained revision during each drain pass, including multiple passes after stopping production.                                                         |
| Measurement      | A read-only historical replica lookup took 7.3 seconds locally, or 4 seconds with CLI telemetry disabled.                                                                                                       |
| Implementation   | Prove inactive historical revisions have zero actual replicas before stopping; reuse cutover-local proofs only while full inventories confirm unchanged inactive identities.                                    |
| Invalidation     | Activity, disappearance or changed image invalidates proof; new revisions require actual replica reads; proof does not survive another cutover call.                                                            |
| Regression       | 101-revision fixture proves all historical reads precede deactivation and normal downtime replica reads remain constant; 174 automation tests passed.                                                           |
| Publication      | PR 4 merged as 2259423aca8302abd30a0e5f15f65e17655291dc; PR CI 37029666484 and main CI 37029921622 passed.                                                                                                      |
| Live rehearsal   | Actual Azure read-only rehearsal queried all 100 historical replica lists in 418 seconds before its first blocked mutation; zero Azure writes.                                                                  |
| Observation      | Public health sampling saw an unhealthy interval at 16:16:57Z and healthy new-build responses from 16:19:38Z; sampling also saw an earlier transient failure, so this is not an exact availability measurement. |

### Resolved handoff blocker

| Field                | Value                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run                  | https://github.com/bk201-/personal-hub/actions/runs/37030254797                                                                                        |
| Deployment id        | 6812483893                                                                                                                                             |
| Result               | qualify succeeded; deploy failed at Verify source handoff and recheck CI before Azure login or any runtime operation.                                  |
| Resolution           | Owner replaced PAT_TOKEN at 2026-10-02T16:09:30Z after source-only fine-grained Actions read instructions; the unchanged hosted guard passed on retry. |
| Permission guardrail | The broader local OAuth token was not copied into Actions; source credentials are used only for read-only handoff checks.                              |

#### Evidence

- Runner SHA, CI run/attempt and stop-before-start mode match the expected current main.
- Both runner tokens were present and masked; the same guard and inputs pass with the authorized local GitHub identity.
- Source Build Main is disabled_manually; every nonterminal run status was empty.

### Activation

| Field                         | Value                                                                 |
| ----------------------------- | --------------------------------------------------------------------- |
| Source build main             | disabled_manually                                                     |
| Source workflow id            | 249856757                                                             |
| Source drained                | queued/in_progress/waiting/pending/requested all zero before dispatch |
| TG NEWS READER DEPLOY ENABLED | true                                                                  |
| TG NEWS READER CUTOVER MODE   | stop-before-start                                                     |
| AUTO MERGE OWNER PRS          | unset                                                                 |

### Preserved

- Same Azure app, storage mount, remote database, application environment and Telegram session; only the deployed image/revision changed.
- Old image digest remains readable after successful image retention; old revision and private database/media recovery copies remain available.
- No live data restore, Telegram reauthentication, second app or parallel client was used.

## Historical validation

| Field   | Value                                                                                   |
| ------- | --------------------------------------------------------------------------------------- |
| Date    | 2026-09-30                                                                              |
| Meaning | Recorded migration results, not a claim that today's working tree has been revalidated. |

### Completed

- News/Czech/shared builds and typechecks, with 1410 passing tests before the CV import.
- Isolated local auth/version/database smoke tests without a live Telegram connection.
- CV check/build, all-app build/typecheck, root lint/format and local HTTP routes after import.
- Clean install and scoped production dependency layouts using isolated offline fixtures.
- Original source status/index/ref/file invariants and preserved histories.

### Limitations

- Docker images were not built or executed; the Node base image was not cached.
- Live Telegram/download end-to-end behavior was not exercised.
- CV visual/print review and PDF regeneration were not performed.
- VK/Spotify feasibility was not tested; no credentials were configured.
- An in-place clean install encountered a Windows lock on an Oxfmt DLL; an isolated clean install passed.
- Scoped production installs retained optional Vite/tsx/TypeScript peers; do not claim all build tooling is absent.

## Workflow migration validation

| Field | Value      |
| ----- | ---------- |
| Date  | 2026-10-02 |

### Completed

- Root app/shared builds, server builds, typechecks, tests and lint passed.
- Both app Dockerfiles built from the root context; network-isolated disposable image smoke checks passed.
- 134 automation safety/contract tests passed, including cumulative deployment changes and retained pending queues.
- Hosted CI run 37019081969 passed all nine jobs for commit 142bcd2, including both Linux images and all workspaces.

### Limitations

- Existing CV template formatting fails its full Astro formatting check; preserve imported templates outside the requested scope.
- Workflow PR 2 is merged and main CI run 37021804716 passed; actual owner-automation execution remains unexercised.
- TG_NEWS_READER_DEPLOY_ENABLED and AUTO_MERGE_OWNER_PRS remain unset/off.
- No production deployment, live Telegram smoke or Azure infrastructure change was performed.

## Recovery

| Field                    | Value                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sibling backup directory | personal-hub-backup-20260930                                                                                                             |
| News history             | 198 original main commits retained with original IDs; all-ref bundle in backup.                                                          |
| Czech history            | No original commits; raw worktree/index snapshots preserve the pre-import state.                                                         |
| Cv history               | 10 original commits retained under refs/archive/dmitriishilov.com/heads/main and in a verified bundle.                                   |
| Cv backup subdirectory   | cv-import                                                                                                                                |
| Portability              | Sibling originals/backups and archive refs are local recovery aids, not runtime dependencies. Do not assume a later clone includes them. |

### Sibling original repositories

- tg-news-reader
- czech-learning
- dmitriishilov.com
