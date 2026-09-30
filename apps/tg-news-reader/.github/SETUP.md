# GitHub Repository Setup Checklist

After pushing this code to GitHub, complete the following one-time manual steps.

---

## 1 · Ruleset for `main`

Go to **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| Ruleset name       | `Protect main`                               |
| Enforcement status | **Active**                                   |
| Target branches    | **Add target → Include by pattern → `main`** |

Enable the following **Rules**:

| Rule                                  | Value                                                   |
| ------------------------------------- | ------------------------------------------------------- |
| Restrict deletions                    | ✅                                                      |
| Block force pushes                    | ✅                                                      |
| Require a pull request before merging | ✅ — Required approvals: **0**                          |
| Require status checks to pass         | ✅                                                      |
| ↳ Add required check                  | type `Build & Lint`, select the entry from the dropdown |
| ↳ Require branches to be up to date   | ✅                                                      |

**Bypass list** — leave empty so even the repo owner cannot push directly to `main`.

> The required check name must match exactly: **`Build & Lint`**  
> (appears in the dropdown only after the workflow has run at least once —  
> push a test PR first if the dropdown is empty).

---

## 2 · Allow Auto-merge

Go to **Settings → General → Pull Requests** and enable:

- [x] **Allow auto-merge**

This is required for the `gh pr merge --squash` call in `pr-check.yml` to work  
when `GITHUB_TOKEN` has write but not admin permissions.

---

## 3 · Actions Permissions

Go to **Settings → Actions → General**:

- **Actions permissions** → Allow all actions (or at least GitHub + trusted marketplace)
- **Workflow permissions** → Read and write permissions
- [x] Allow GitHub Actions to create and approve pull requests

---

## 4 · (Optional) Make Repository Public

**Settings → Danger Zone → Change repository visibility → Make public**

Public repos get unlimited GitHub Actions minutes. Private repos are limited to  
the free-tier 2 000 min/month.

---

## Workflow Summary

```
feature-branch → PR to main
                  │
                  ├─ pr-check.yml  →  Build & Lint  (required check)
                  │                        │ pass
                  │                   auto-merge job
                  │                   (only if actor == bk201-)
                  │                        │
                  │                   gh pr merge --squash
                  │
                  └─ merge commit lands on main
                              │
                         build-main.yml
                              │
                         Build & Lint  (re-validates)
                              │ pass
                         Docker build → tg-news-reader.tar.gz
                              │
                         upload artifact  (keep 3 latest)
```
