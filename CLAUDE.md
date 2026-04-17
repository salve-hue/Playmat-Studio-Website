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
