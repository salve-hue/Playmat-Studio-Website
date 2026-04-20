# Playmat Studio — Standalone Advanced Editor Demo

## What this repo is

This is a **standalone, single-file copy of the Playmat Studio Advanced Editor** (the tool at `playmatstudio.com/beta/`). It exists so the editor can be served independently (e.g. via GitHub Pages) without needing a full copy of the main site's assets.

There is exactly one page: `index.html`.

## How assets work

All assets — stylesheets, scripts, fonts, and images — are loaded from the live main site at `https://playmatstudio.com`. No local copies are kept here. This is intentional.

| Asset | Loaded from |
|---|---|
| `custom.css` | `https://playmatstudio.com/assets/css/custom.css` |
| `tool.css` | `https://playmatstudio.com/assets/css/tool.css` |
| `tool.js` | `https://playmatstudio.com/assets/js/tool.js` |
| Fonts (`Under Subway.ttf`) | `https://playmatstudio.com/assets/` |
| Logo & favicon | `https://playmatstudio.com/images/` |

## Where to make changes

| Change type | Where to edit |
|---|---|
| Editor UI layout, page structure, CSP, meta tags | `index.html` in **this repo** |
| Tool behaviour, canvas logic, game layouts | `assets/js/tool.js` in **salve-hue/Playmat-Studio-Website** |
| Tool styling, component appearance | `assets/css/tool.css` in **salve-hue/Playmat-Studio-Website** |
| Global site styles (variables, typography) | `assets/css/custom.css` in **salve-hue/Playmat-Studio-Website** |

After changing `tool.js` or `tool.css` in the main repo, bump the `?v=` cache-buster query string in `index.html` here to match.

## GitHub Pages

This repo is intended to be served via GitHub Pages from the `main` branch root. The page will be available at the repo's GitHub Pages URL (e.g. `https://salve-hue.github.io/Playmat-Studio-Website/` or a custom domain if a CNAME is configured).

## Deployment workflow

**IMPORTANT: Never push to `main` unless the user explicitly requests it.** All development work goes to the feature branch only. The sync workflow (`sync-beta.yml`) automatically copies `beta/index.html`, `tool.js`, and `tool.css` to `main` on push.

**Never sync or overwrite the root `index.html` on `main`.** It is the full main site homepage and must not be touched by the sync workflow or manual deploys. Only `beta/index.html`, `assets/js/tool.js`, and `assets/css/tool.css` are safe to sync.

When the user explicitly asks to deploy:
1. Commit and push to the feature branch (`claude/setup-standalone-demo-site-gfFAb`)
2. Check out `main`, pull, copy only the changed tool files (never root `index.html`), commit, and push
3. Return to the feature branch

```bash
git fetch origin main && git checkout main && git pull origin main
git show <feature-branch>:beta/index.html > beta/index.html
git show <feature-branch>:assets/js/tool.js > assets/js/tool.js   # if changed
git show <feature-branch>:assets/css/tool.css > assets/css/tool.css  # if changed
git add beta/index.html assets/js/tool.js assets/css/tool.css
git commit -m "deploy: <description>" && git push origin main
git checkout claude/setup-standalone-demo-site-gfFAb
```

Also bump the `?v=` cache-buster on `tool.js` in `beta/index.html` whenever `tool.js` changes.
