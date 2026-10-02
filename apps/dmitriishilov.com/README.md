# dmitriishilov.com

Independent static CV site using Astro, Alpine.js and Tailwind CSS. Imported from the existing repository's current worktree, including unpublished edits and the existing downloadable PDF. No React shell, shared authentication, database or active deployment is added.

## Local use

Use the monorepo's Node.js baseline and single root lockfile. From the repository root:

```sh
npm ci
npm run dev:cv
npm run typecheck --workspace dmitriishilov.com
npm run build --workspace dmitriishilov.com
npm run preview --workspace dmitriishilov.com
```

Development and preview bind to `127.0.0.1:4321`. Stop one before starting the other. The static build lives in this workspace's `dist/`; it does not need the shared React/server packages.

Current routes are `/` (CV) and `/d7k9m/` (links page). The latter is not authentication: anyone with its URL can read it. The historical Russian-language route remains proposed, not implemented.

## Content and checks

- `cv.json` contains the CV data; `src/` contains Astro components and styles; `public/` contains static assets and the preserved `cv-en.pdf`.
- `astro check` validates Astro templates and TypeScript. Root lint/format checks cover supported non-Astro files; generated `.astro/` output is ignored. The retained Prettier Astro plugin supports explicit template formatting via `npm run format:astro --workspace dmitriishilov.com` and checking via `format:astro:check`. Imported template formatting is retained rather than rewritten during migration.
- `npm run pdf --workspace dmitriishilov.com` rebuilds and intentionally overwrites both `dist/cv-en.pdf` and `public/cv-en.pdf`. It requires a locally installed Playwright Chromium browser and a free port 4321. Workspace scripts run from the app directory, so the original relative PDF paths remain valid. PDF generation is not part of the normal build and was not run during import.
- No test runner is defined for this app; typecheck/build and local route/PDF smoke checks are the migration validation, not comprehensive visual or print QA.

## Plans and provenance

[PRD](../../plans/dmitriishilov.com/prd-cv-site.md) and [historical implementation plan](../../plans/dmitriishilov.com/cv-site.md) live with their supporting PDF/photo under root `plans/dmitriishilov.com/`. Their unchecked tasks describe original intent, not current feature completion.

Source: `C:\Users\dshilov\WebstormProjects\dmitriishilov.com`, HEAD `fb3abfafcd554738198806a95b56c294acfd24d9` (10 commits), imported on 2026-09-30. Current worktree content takes precedence over the staged index. Original commit IDs remain reachable via local `refs/archive/dmitriishilov.com/heads/main`, outside the monorepo branch ancestry. Verified all-ref bundle, separate worktree/index backups and hash provenance live at `C:\Users\dshilov\WebstormProjects\personal-hub-backup-20260930\cv-import`.

The source repository is unchanged. Its workflow is preserved byte-for-byte under `docs/archive/dmitriishilov.com/.github/workflows/deploy.yml`, outside active workflow discovery. The configured production `site` URL is metadata, not a deployment. Publishing requires separate authorization.
