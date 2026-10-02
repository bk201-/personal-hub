# CV Site — Implementation Plan

> PRD: [prd-cv-site.md](prd-cv-site.md)  
> Workspace: `apps/dmitriishilov.com` in `personal-hub` (originally a separate repository)  
> Domain: `dmitriishilov.com`

> Historical implementation plan copied from the source repository's current worktree on 2026-09-30.
> The tasks and acceptance criteria below retain their original unchecked status, not verified implementation status.
> Repository creation, CI, hosting, DNS and deployment steps are archived intent only; this import enables local use only.
> Supporting source assets remain alongside this plan: `Profile.pdf` and `photo_2025-04-01_16-54-42.jpg`.
> App paths below are relative to `apps/dmitriishilov.com`; its original workflow is inactive under `docs/archive/dmitriishilov.com/.github/workflows/`.

## Architectural Decisions (durable)

- **Routes**: `/` (EN CV), `/ru/` (RU CV), `/d7k9m/` (hidden links hub)
- **Content**: `src/data/cv-en.json` + `src/data/cv-ru.json` — structured data, no DB
- **Layout**: Astro Layout component, 2-column CSS Grid for desktop/print, single-column for mobile
- **i18n**: Astro built-in i18n routing (`defaultLocale: 'en'`, `locales: ['en', 'ru']`)
- **PDF**: Playwright in CI generates `dist/cv-en.pdf` + `dist/cv-ru.pdf` from built HTML
- **Hosting**: Azure Static Web Apps (Free), GitHub Actions deploy

---

## Phase 1 — Skeleton + Deploy

> US 1, 17, 19 — Proves the full pipeline: repo → Astro → GitHub Actions → Azure Static Web Apps.

### Tasks

- [ ] Create GitHub repo `cv-site` (or `dmitriishilov.com`)
- [ ] `npm create astro@latest` — empty project, TypeScript strict
- [ ] Add `astro.config.mjs`: `output: 'static'`, `site: 'https://dmitriishilov.com'`
- [ ] Create `src/pages/index.astro` — placeholder "Coming soon" page
- [ ] Create `src/layouts/BaseLayout.astro` — `<html>`, `<head>` (charset, viewport, title), `<body>`
- [ ] Add `.github/workflows/deploy.yml`:
  - trigger: push to `main`
  - steps: checkout → setup-node → `npm ci` → `npm run build` → deploy to Azure Static Web Apps
- [ ] Create Azure Static Web App resource (or document CLI commands)
- [ ] Verify: push to `main` → site live at `*.azurestaticapps.net`

### Acceptance

- `npm run build` produces `dist/index.html`
- GitHub Action deploys successfully
- Site accessible at Azure URL (custom domain deferred to Phase 7)

---

## Phase 2 — CV Layout + Content (EN only)

> US 7, 8, 9, 10, 11, 12, 13, 14, 18, 21 — Full CV rendering from JSON, responsive.

### Tasks

- [ ] Create `src/data/cv-en.json` — all CV sections as structured data:
  ```
  { name, title, photo, contacts: [...], summary, 
    skills: [{ category, items }], 
    experience: [{ company, role, period, bullets }],
    education: [{ institution, degree, year }],
    projects: [{ name, url, description }],
    languages: [{ name, level }] }
  ```
- [ ] Create Astro components (all in `src/components/`):
  - `Header.astro` — photo + name + title + contact links (LinkedIn, GitHub, Telegram, email)
  - `Summary.astro` — 2-3 sentence paragraph
  - `Skills.astro` — grouped by category, compact tags/pills
  - `Experience.astro` — company, role, period, bullet points
  - `Education.astro` — institution, degree, year
  - `Projects.astro` — name + link + one-line description
  - `Languages.astro` — language + proficiency level
- [ ] Create `src/layouts/CVLayout.astro` — 2-column CSS Grid:
  - Left (narrow): photo, contacts, skills, languages
  - Right (wide): summary, experience, education, projects
- [ ] Update `src/pages/index.astro` — import JSON + render all components
- [ ] Add responsive CSS: single-column below 768px
- [ ] Add placeholder photo `public/photo.jpg`

### Acceptance

- `npm run build` succeeds
- Desktop: 2-column layout, all sections visible
- Mobile (< 768px): single-column, stacked
- Zero client-side JS in output

---

## Phase 3 — Print Stylesheet

> US 4, 20 — `@media print` for clean A4 output.

### Tasks

- [ ] Add `src/styles/print.css`:
  - Hide: download button, language switcher, any non-CV elements
  - Force: white background, black text, no box-shadows
  - Set: `@page { size: A4; margin: 12mm 15mm; }`
  - Font: 10-11px base for 1-page fit
  - Keep 2-column layout but tighter gaps/margins
  - `page-break-inside: avoid` on experience items
- [ ] Import `print.css` in `BaseLayout.astro` with `media="print"`
- [ ] Test in Chrome Print Preview: verify 1-page fit with placeholder content
- [ ] If content overflows → adjust font-size / spacing in print stylesheet

### Acceptance

- `Ctrl+P` in Chrome shows clean A4 layout
- Fits on 1 page (or 2 max with full content)
- No buttons, nav, or decorative elements in print

---

## Phase 4 — PDF Generation in CI

> US 2, 3, 6 — Playwright generates PDFs, "Download CV" button works.

### Tasks

- [ ] `npm install -D playwright` (chromium only)
- [ ] Create `scripts/generate-pdf.mjs`:
  - Start a static file server on `dist/` (e.g., `npx serve dist -l 4321`)
  - Launch Playwright Chromium
  - Navigate to `http://localhost:4321/`
  - `page.pdf({ format: 'A4', printBackground: false })` → `dist/cv-en.pdf`
  - Assert: file size > 10KB, page count ≤ 2 (via pdf-parse or manual check)
  - Kill server
- [ ] Update `.github/workflows/deploy.yml`:
  - After `npm run build`: install Playwright → run `generate-pdf.mjs` → PDFs land in `dist/`
- [ ] Add "Download CV" button to `Header.astro`: `<a href="/cv-en.pdf" download>`
- [ ] Mark button as `print:hidden` (no-print class)

### Acceptance

- CI generates `dist/cv-en.pdf` (visible in Actions artifacts)
- "Download CV" button downloads PDF in one click
- PDF content matches web version

---

## Phase 5 — i18n (Russian)

> US 5, 6 — Russian locale, language switcher, Russian PDF.

### Tasks

- [ ] Update `astro.config.mjs`:
  ```js
  i18n: { defaultLocale: 'en', locales: ['en', 'ru'], routing: { prefixDefaultLocale: false } }
  ```
- [ ] Create `src/data/cv-ru.json` — translated CV content
- [ ] Create `src/pages/ru/index.astro` — same layout, reads `cv-ru.json`
- [ ] Add language switcher to `Header.astro`: EN link (`/`) + RU link (`/ru/`)
  - Highlight current language
  - `print:hidden`
- [ ] Update `scripts/generate-pdf.mjs`:
  - Also navigate to `http://localhost:4321/ru/` → `dist/cv-ru.pdf`
- [ ] Update "Download CV" button: `/cv-en.pdf` on EN page, `/cv-ru.pdf` on RU page
- [ ] Consider: helper function `getCV(lang)` that imports the right JSON

### Acceptance

- `/` renders EN CV, `/ru/` renders RU CV
- Switcher links work both ways
- CI generates both `cv-en.pdf` and `cv-ru.pdf`
- Download button serves correct language

---

## Phase 6 — Hidden Links Hub

> US 15, 16 — Secret page for private app links.

### Tasks

- [ ] Create `src/pages/d7k9m/index.astro`:
  - Simple page with styled link cards
  - Links: tg-news-reader, future apps
  - `<meta name="robots" content="noindex, nofollow">`
- [ ] Create `src/data/links.json`:
  ```json
  [
    { "name": "TG News Reader", "url": "https://tg-news-reader...", "icon": "📰" },
    { "name": "CV Site Admin", "url": "...", "icon": "⚙️" }
  ]
  ```
- [ ] Verify: page NOT in `<nav>`, NOT in sitemap
- [ ] Style: simple grid of cards, dark background, centered

### Acceptance

- `/d7k9m/` renders link cards
- Page not discoverable via navigation or sitemap
- `<meta robots noindex>` present in HTML

---

## Phase 7 — Polish

> US 22 — Theme, meta tags, domain, final review.

### Tasks

- [ ] `prefers-color-scheme` support:
  - Light default (white bg, dark text)
  - Dark: dark bg, light text — only via media query, no toggle
  - Print: always light
- [ ] Add meta tags to `BaseLayout.astro`:
  - `<title>`, `<meta description>`, `<meta og:title/description/image>`
  - OG image: simple card with name + title (can generate via og-image service or static PNG)
- [ ] Add favicon: `public/favicon.ico` + `public/favicon.svg`
- [ ] Configure custom domain:
  - Azure Portal: add `dmitriishilov.com` custom domain
  - DNS: CNAME or A record pointing to Azure Static Web Apps
  - Verify SSL auto-provision
  - Add `www` → apex redirect (Azure handles this)
- [ ] Final content review: fill in real CV data
- [ ] Replace placeholder photo with real/AI photo
- [ ] Smoke test: all pages, print, PDF download, mobile, dark mode

### Acceptance

- Site live at `dmitriishilov.com`
- All sections have real content
- Dark mode respects system preference
- OG card shows correctly when sharing link
- Print + PDF both clean on 1 A4 page
