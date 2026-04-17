# Playmat Studio — Claude Code Context

## Repo
`salve-hue/Playmat-Studio-Website`

## Authorized push branch
`claude/document-page-overview-o7u0M`

**Never push to `main` or any other branch.** The session proxy will reject it with a 403.

---

## Site structure

| Path | Purpose |
|------|---------|
| `index.html` | Production marketing + tool page (main site) |
| `assets/css/custom.css` | Site-wide styles |
| `assets/css/tool.css` | Tool-specific styles (shared by main + beta) |
| `assets/js/tool.js` | The tool itself — standalone, no jQuery |
| `beta/index.html` | Stripped tool-only demo page (no marketing content) |

## The beta site (`beta/index.html`)

This is a pared-down version of the main site that shows **only the Advanced Editor** — logo-only header, mat size selector, then the editor filling the rest of the page.

Key differences from `index.html`:
- No hero, features, how-it-works, contact, or footer sections
- No tab bar (Batch Enhance / Format Converter / Image Host tabs removed)
- No jQuery, breakpoints, or main.js — only `tool.js`
- All asset paths are **root-relative** (`/assets/css/...`, `/images/...`) so the page works when served from `/beta/`
- Inline `<style>` block overrides box framing so the editor flows flush into the page

When working on the beta site, **edit `beta/index.html` only**. Do not modify `index.html` or shared assets unless the change is intentionally for both sites.

## Deployment

Pushing to `claude/document-page-overview-o7u0M` triggers `.github/workflows/deploy-preview.yml`, which deploys:

| URL | Source |
|-----|--------|
| `playmatstudio.com/` | `main` branch |
| `playmatstudio.com/preview/` | this branch (full copy) |
| `playmatstudio.com/beta/` | `beta/` folder from this branch |

## Shared assets

`tool.js`, `tool.css`, `custom.css`, and all images are shared between the main site and the beta page. Changes to those files affect both. If a change should only apply to `/beta/`, use an inline `<style>` override in `beta/index.html` instead.
