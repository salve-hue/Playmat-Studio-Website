# Playmat Studio — Advanced Editor

## Site structure

| URL | File on `main` | Purpose |
|---|---|---|
| `playmatstudio.com/` | `index.html` | **Production tool** — stable, promoted manually |
| `playmatstudio.com/beta/` | `beta/index.html` | **Development preview** — auto-updated on every push to `beta` branch |

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
| Editor UI layout, page structure, CSP, meta tags | `beta/index.html` on the `beta` branch |
| Tool behaviour, canvas logic, game layouts | `assets/js/tool.js` on the `beta` branch |
| Tool styling, component appearance | `assets/css/tool.css` on the `beta` branch |
| Global site styles (variables, typography) | `assets/css/custom.css` on the `beta` branch |

After changing `tool.js` or `tool.css`, bump the `?v=` cache-buster query string in `beta/index.html` to match.

## Development workflow

Every push to the `beta` branch automatically:
1. Copies `beta/index.html` → main's `beta/index.html` (updates `/beta/` preview)
2. Copies `tool.js` and `tool.css` → main's shared assets (used by both `/` and `/beta/`)
3. Triggers a Pages redeploy

`main`'s root `index.html` (production) is **never touched automatically**.

## Promoting to production

When the user explicitly asks to deploy / make changes live at the root URL:

```bash
git fetch origin main && git checkout main && git pull origin main
git show beta:beta/index.html > index.html
git show beta:assets/js/tool.js > assets/js/tool.js   # if changed
git show beta:assets/css/tool.css > assets/css/tool.css  # if changed
git add index.html assets/js/tool.js assets/css/tool.css
git commit -m "deploy: <description>" && git push origin main
git checkout beta
```

**IMPORTANT:** Never push to `main` unless the user explicitly requests it. Never overwrite `main`'s `beta/index.html` manually — the sync workflow manages it. Never delete or replace the redirect at `beta/index.html` on main outside of the sync flow.
