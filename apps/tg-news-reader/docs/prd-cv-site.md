# PRD: Personal CV Site — dmitriishilov.com

> Date: April 2026

## Problem Statement

There is no personal landing page or CV site. When sharing a resume with potential employers or contacts, the only option is a static PDF file sent manually. There's no central place that:

- Presents a professional CV in a web-friendly format
- Allows instant PDF download with consistent formatting
- Provides a language switcher (EN/RU) for different audiences
- Serves as a personal hub with links to other projects and profiles
- Prints cleanly on a single A4 page

## Solution

A minimalist, information-dense personal CV website at `dmitriishilov.com`, built with Astro (SSG) and hosted on Azure Static Web Apps (Free tier). The site has two "faces":

1. **Public CV page** (`/` for EN, `/ru/` for RU) — a dense, newspaper-style layout with all CV sections, a language switcher, and a "Download CV" button that serves a pre-generated PDF.
2. **Hidden links hub** (`/[secret-slug]/`) — a personal dashboard with links to private apps (tg-news-reader, etc.), not indexed, not linked from navigation.

PDF files are auto-generated in CI via Playwright (HTML → PDF) on every push to `main`, ensuring the downloadable CV always matches the web version.

## User Stories

1. As a job seeker, I want my CV available at a memorable URL (`dmitriishilov.com`), so that I can share it verbally or in messages without attaching files.
2. As a job seeker, I want a "Download CV" button that instantly downloads a PDF, so that recruiters get a professionally formatted document in one click.
3. As a job seeker, I want the PDF to be auto-generated from the same HTML as the web page, so that I never have inconsistencies between web and PDF versions.
4. As a job seeker, I want the printed/PDF version to fit on 1 page A4 (2 pages max), so that it's concise and recruiter-friendly.
5. As a job seeker, I want to switch between English and Russian versions, so that I can target both international and local markets.
6. As a job seeker, I want the PDF to be generated in the currently selected language, so that EN visitors download an EN CV and RU visitors download an RU CV.
7. As a job seeker, I want my professional photo in the header, so that the CV feels personal and matches EU/RU conventions.
8. As a job seeker, I want links to LinkedIn, GitHub, Telegram, and email in the header, so that visitors can reach me through their preferred channel.
9. As a job seeker, I want a Summary section (2-3 sentences), so that visitors immediately understand my profile.
10. As a job seeker, I want a Skills section grouped by category (Languages, Frameworks, Cloud, Tools), so that technical recruiters can quickly scan my stack.
11. As a job seeker, I want an Experience section with company, role, period, and achievement bullets, so that my work history is clear.
12. As a job seeker, I want an Education section, so that my academic background is visible.
13. As a job seeker, I want a Projects section with links, so that I can showcase pet projects (tg-news-reader, this CV site).
14. As a job seeker, I want a Languages section (human languages + proficiency), so that multilingual ability is visible.
15. As a site owner, I want a hidden links page at an unguessable URL, so that I can quickly navigate to my private apps from any device.
16. As a site owner, I want the hidden page excluded from sitemap and navigation, so that it's not discoverable by crawlers or casual visitors.
17. As a site owner, I want the site to deploy automatically on push to `main`, so that I never manually upload files.
18. As a site owner, I want CV data stored in structured JSON/YAML files (not hardcoded in templates), so that updating content doesn't require touching component code.
19. As a site owner, I want the site to load with 0 KB of client-side JavaScript, so that it's instant on any device.
20. As a site owner, I want to use `Ctrl+P` / browser print and get the same clean layout as the PDF, so that printing from the browser also works.
21. As a mobile visitor, I want the CV page to be responsive, so that it reads well on a phone screen.
22. As a visitor, I want the page to respect system dark/light preference (`prefers-color-scheme`), so that it's comfortable to read — or a single neutral theme that works in both.

## Implementation Decisions

### Stack & Hosting

- **Astro** (SSG mode, zero client JS) — new project, separate git repo
- **Azure Static Web Apps** (Free tier) — custom domain `dmitriishilov.com`, auto SSL
- **GitHub Actions** for CI/CD: build → generate PDFs → deploy

### Template

- Based on **Print-Friendly Portfolio CV** (free Astro theme) — minimal, dense, print-optimized
- Stripped of unnecessary features, adapted for i18n and custom sections

### Content Layer

- CV data lives in structured files (JSON or YAML) under `src/data/`
- Separate files per language: `cv-en.json` and `cv-ru.json` (or YAML equivalent)
- Components read data via Astro imports — no runtime fetching
- Single source of truth: edit JSON → web + PDF update automatically

### i18n Routing

- Astro's built-in i18n: `/` = English (default), `/ru/` = Russian
- Language switcher in header: simple `<a>` links between `/` and `/ru/`
- No JS-based language detection — explicit user choice via URL

### Print & PDF

- `@media print` stylesheet: hides nav, buttons, lang switcher; forces single-column compact layout; targets A4 dimensions
- Print view is the same HTML, just styled differently — no separate "print page"
- **PDF generation in CI**: GitHub Action installs Playwright → runs a script that opens `http://localhost:4321/` and `/ru/` → `page.pdf({ format: 'A4' })` → saves to `dist/cv-en.pdf` and `dist/cv-ru.pdf`
- "Download CV" button = `<a href="/cv-en.pdf" download>` (or `/cv-ru.pdf` on Russian page)

### Layout

- **Desktop**: 2-column layout — narrow left (photo, contacts, skills, languages), wide right (summary, experience, education, projects)
- **Mobile**: single column, stacked
- **Print**: same 2-column but tighter margins, smaller font, no color backgrounds
- System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- Minimal color: one accent color for headings/name, rest is black/grey on white

### Hidden Links Page

- URL: unguessable slug (e.g., `/d7k9m/`)
- Not in `<nav>`, not in `sitemap.xml`, not in `robots.txt`
- Contains: styled link cards to private apps (tg-news-reader, future apps)
- Security through obscurity only — no auth needed (apps behind the links have their own auth)

### CI/CD Pipeline

```
push to main
  → npm run build (Astro SSG → dist/)
  → npx playwright install chromium
  → node scripts/generate-pdf.mjs (serves dist/, screenshots to PDF)
  → copy PDFs into dist/
  → deploy dist/ to Azure Static Web Apps
```

### Domain Setup

- `dmitriishilov.com` → Azure Static Web Apps custom domain (CNAME or A record)
- Auto-managed SSL certificate (Azure provides free cert)
- `www.dmitriishilov.com` → redirect to apex domain

## Testing Decisions

No automated tests are planned for this project:

- **Zero business logic** — pure static HTML/CSS, no interactivity, no state
- **CI build is the test** — if Astro builds successfully and Playwright generates PDFs without errors, the site is working
- **PDF generation script** can assert file size > 0 and page count ≤ 2 as a basic smoke check
- **Manual QA**: check print preview in Chrome before merging content changes

## Out of Scope

- **Blog** — may be added later via Astro content collections, but not in v1
- **Analytics** — no tracking, no cookies (can add privacy-friendly analytics like Plausible later)
- **Contact form** — email link is sufficient; no server-side processing
- **CMS** — content edited directly in JSON/YAML files, no admin UI
- **Dark mode toggle** — either respect `prefers-color-scheme` automatically or ship a single neutral theme; no manual toggle in v1
- **Animations / transitions** — zero; the site is a document, not an app
- **SEO optimization** — basic meta tags and OG image, but no advanced SEO strategy (it's a personal page, not a content site)

## Further Notes

- The project is **completely independent** from `tg-news-reader` — separate repo, separate CI, separate hosting
- Photo can be AI-enhanced/generated if needed — just drop a new image file
- Secret links page slug should be stored in a constant, easy to change if discovered
- Consider adding `<meta name="robots" content="noindex">` to the links page as an extra measure
- Astro v5+ recommended for latest i18n support and performance
