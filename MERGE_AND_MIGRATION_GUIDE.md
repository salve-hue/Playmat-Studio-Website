# Playmat Studio — Merge & Migration Guide

**Purpose:** Reference document for merging this codebase with a second version and converting the result to a Shopify app.
**Codebase version:** v1.7.1b
**Date captured:** March 2026

---

## Table of Contents

1. [File Inventory](#1-file-inventory)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Feature Inventory](#4-feature-inventory)
5. [Backend — Cloudflare Workers](#5-backend--cloudflare-workers)
6. [Data Flow](#6-data-flow)
7. [State Management](#7-state-management)
8. [Canvas & Export System](#8-canvas--export-system)
9. [Game Overlay Library](#9-game-overlay-library)
10. [CSS Architecture](#10-css-architecture)
11. [JavaScript Architecture](#11-javascript-architecture)
12. [All Hardcoded Values](#12-all-hardcoded-values)
13. [Storage Usage](#13-storage-usage)
14. [External Dependencies](#14-external-dependencies)
15. [Known Issues & Incomplete Code](#15-known-issues--incomplete-code)
16. [Shopify Conversion Notes](#16-shopify-conversion-notes)

---

## 1. File Inventory

### Root
| File | Size | Purpose |
|------|------|---------|
| `index.html` | 91 KB | Entire application — SPA, all tools, all modals, inline JS |
| `404.html` | 2.6 KB | Custom GitHub Pages error page |
| `CNAME` | 17 B | GitHub Pages custom domain: `playmatstudio.com` |
| `robots.txt` | 75 B | Allows all crawlers, points to sitemap |
| `sitemap.xml` | 278 B | Single-URL sitemap for `playmatstudio.com` |
| `contact-worker.js` | 3.5 KB | Cloudflare Worker: contact form → Resend email API |
| `playmat-host-worker.js` | 5.1 KB | Cloudflare Worker: file upload/serve/delete via R2 |
| `TECHNICAL_REFERENCE.md` | 27 KB | Developer reference (pre-existing) |
| `MERGE_AND_MIGRATION_GUIDE.md` | this file | — |
| `Playmat_Studio_Technical_Reference.docx` | 49 KB | Word export of technical reference |

### `assets/css/`
| File | Size | Purpose |
|------|------|---------|
| `main.css` | 58 KB | Phantom HTML5 UP base theme (not modified) |
| `custom.css` | 36 KB | All site customisations, layout overrides, modals |
| `tool.css` | 28 KB | All tool UI: editors, sidebars, panels, responsiveness |
| `fontawesome-all.min.css` | 59 KB | Font Awesome 6 icon library (self-hosted) |
| `noscript.css` | 296 B | Fallback styles when JS is disabled |

### `assets/js/`
| File | Size | Purpose |
|------|------|---------|
| `tool.js` | 145 KB | Entire tool application logic (2,472 lines) |
| `main.js` | 3.5 KB | Site navigation, mobile menu, scroll-to-top |
| `jquery.min.js` | 88 KB | jQuery 3.x (self-hosted) |
| `util.js` | 13 KB | Phantom theme utilities |
| `breakpoints.min.js` | 2.4 KB | Phantom theme breakpoint helpers |
| `browser.min.js` | 2.1 KB | Phantom theme browser detection |

### `images/`
| File | Purpose |
|------|---------|
| `favicon.svg` | SVG favicon |
| `apple-touch-icon.png` | iOS home screen icon |
| `logo.svg` | Navigation logo |
| `og-preview.jpg` | Open Graph social share image |
| `background.jpg` | Hero/page background texture |

### `audits/`
| File | Purpose |
|------|---------|
| `security-audit-2026-03-12.md` | Security audit: 16 findings (2 Critical, 4 High, 5 Medium, 5 Low) |

---

## 2. Tech Stack

### Frontend
| Component | Technology | Version / Notes |
|-----------|-----------|-----------------|
| Markup | HTML5 | Static SPA — single `index.html` |
| Styling | CSS3 | Custom properties, no preprocessor |
| Scripting | Vanilla JS (ES6+) | No bundler, no TypeScript |
| Base theme | Phantom by HTML5 UP | Heavily customised |
| DOM utility | jQuery | 3.x, self-hosted |
| Canvas engine | Fabric.js | 5.3.1, CDN, SRI-pinned |
| ZIP library | JSZip | 3.10.1, CDN, SRI-pinned |
| Icons | Font Awesome | 6.x, self-hosted CSS |

### Fonts (Google Fonts CDN)
- Plus Jakarta Sans (200–800, italic)
- JetBrains Mono (400, 500) — added for changelog modal
- Rubik (300–900, italic)
- Bangers, Cinzel, Dancing Script, Oswald, Pacifico, Permanent Marker, Press Start 2P, Roboto, Shadows Into Light

### CDN Scripts (with SRI)
```html
<!-- Fabric.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js"
  integrity="sha512-..." crossorigin="anonymous"></script>

<!-- JSZip -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
  integrity="sha512-..." crossorigin="anonymous"></script>
```

### Backend / Infrastructure
| Component | Technology |
|-----------|-----------|
| Hosting | GitHub Pages (static) |
| Domain | Cloudflare DNS → `playmatstudio.com` |
| Serverless | Cloudflare Workers (3 deployed, see §5) |
| File storage | Cloudflare R2 bucket (`playmat-studio-hosting-files`) |
| Email | Resend API (`api.resend.com/emails`) |
| AI processing | Replicate API (via Cloudflare Workers) |
| Overlay assets | Cloudflare R2 public bucket (`pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev`) |

---

## 3. Architecture Overview

### Application Structure
The entire app is a **single-page application** with no routing or framework. All content loads in one HTML file. The tool section is a tab-based multi-editor embedded inside the page.

### Tab System
Five tool tabs managed by `switchTab(tabId)`:
1. `quick-upload` — Simple editor (lightbox-style modal within the tab)
2. `adv-editor` — Advanced Editor (full-screen canvas layout within the tab)
3. `batch` — Batch Enhance
4. `converter` — Format Converter
5. `host` — Image Hosting

On tab switch, the relevant backdrop (`#simple-backdrop` or `#adv-backdrop`) is physically **moved in the DOM** into the active tab panel and given the class `tab-mode`, which switches it from `position:fixed` to `position:static`.

### Editor Layouts

**Quick Upload (`#simple-backdrop`):**
- Two-panel: canvas top, controls below
- Single Fabric.js canvas
- No sidebar

**Advanced Editor (`#adv-backdrop → #playmat-tool-root`):**
- Three-column: `#sidebar` (left, 300px) + `#canvas-column` (flex-grow) + floating toolbar
- Three stacked canvases: `#adv-canvas` (artwork), `#layout-canvas` (overlay), `#recolor-canvas` (brush)
- On mobile (≤900px): sidebar stacks below canvas

### Modal System
- **Tool modals** (`.overlay-modal`): Alert, DPI warning, AI confirmation, URL paste, help, bleed confirm — all `position:fixed`, `z-index:9999999`
- **Site modals**: Privacy Policy (`#privacy-modal`), Changelog (`#changelog-modal`) — `position:fixed`, `z-index:99999`
- **Share/Print modals**: `#share-result-modal`, `#get-printed-modal` — inline `position:fixed` with inline styles
- **Simple editor container**: `#simple-backdrop` / `#simple-modal`

---

## 4. Feature Inventory

### Tool 1: Quick Upload
| Feature | Details |
|---------|---------|
| File upload | Click or drag-and-drop |
| URL import | Paste URL via modal, with CORS proxy fallback |
| Zoom | Slider (range input `#s-zoom-in`) |
| Rotate | 90° increments |
| Fit to canvas | Auto-scales artwork to fill mat |
| Enhance filter | Brightness +12%, contrast +8%, saturation +15% |
| Grayscale filter | CSS grayscale(1) |
| Print guides | Toggle bleed/safe-zone overlay |
| Game overlays | Game → Format → Handedness cascade |
| Overlay opacity | Slider control |
| Riftbound points | Secondary overlay selector |
| Download | JPEG at 300 DPI with filename `playmat-{size}-{timestamp}.jpg` |
| Share | Upload to R2, get 7-day link |
| Get Printed | Upload to R2, redirect to print service URL |
| Canvas sizes | All 9 sizes (see §8) |
| Bleed warning | Alert if artwork doesn't cover bleed |
| DPI warning | Alert if uploaded image <300 DPI |
| AI Upscaler | Enhance resolution (external Replicate API) |

### Tool 2: Advanced Editor
All Quick Upload features plus:
| Feature | Details |
|---------|---------|
| Fabric.js canvas | Full object model — artwork as moveable/scaleable object |
| Background colour | Colour picker + hex input (`#bg-color-picker`, `#bg-color-hex`) |
| Eraser brush | Free-draw mask; adjustable size; round or square tip |
| Recolor brush | Paint custom colour onto canvas; adjustable size, colour, tip shape |
| AI Background Removal | Extracts foreground as separate layer (Replicate API) |
| AI Upscaler | Same as Quick Upload |
| Text overlay | Add text objects; 9 font choices; fill, stroke, size, position |
| Brightness slider | Range -100 to +100 |
| Contrast slider | Range -100 to +100 |
| Saturation slider | Range -100 to +100 |
| Auto-optimise | One-click print optimisation (B+12, C+8, S+15) |
| Flip H / Flip V | Fabric.js transform |
| Rotate 90° | Fabric.js transform |
| Rotation slider | Fine angle control |
| Reset rotation | Set angle to 0 |
| Reset scale | `forceFit()` — re-fills canvas |
| Workspace zoom | +/−/reset zoom of the entire canvas view |
| Gradient overlay | On layout layer: gradient angle + two colour stops |
| Solid/gradient mode | Toggle between solid and gradient layout fill |
| Layer compositing | Art → overlay → recolor → AI foreground → eraser mask |
| Export formats | JPEG (default), PNG, WEBP (not exposed in UI, used internally) |
| Undo eraser | Step back one erased path |
| Undo recolor | Step back one brush stroke |
| In-app help | Help modal |
| Full-screen toggle | Native browser fullscreen |
| Accordion sidebar | Collapsible panels: Artwork / Game Layout / Adjustments / Text |

### Tool 3: Batch Enhance
| Feature | Details |
|---------|---------|
| Multi-file upload | Drag-and-drop or file picker |
| Auto enhance | Brightness(112%) contrast(108%) saturate(115%) via CSS filter |
| Preview grid | Thumbnail grid of results |
| Individual download | Per-image download button |
| ZIP download | All results in one archive |
| Clear | Reset panel |

### Tool 4: Format Converter
| Feature | Details |
|---------|---------|
| Multi-file upload | Drag-and-drop or file picker |
| Output format | JPG / PNG / WEBP selector |
| Quality | JPEG 0.95, WEBP 0.95, PNG lossless |
| Individual download | Single file |
| ZIP download | Batch download |
| Clear | Reset panel |

### Tool 5: Image Hosting
| Feature | Details |
|---------|---------|
| Upload | Drag-and-drop or file picker |
| Max size | 50 MB |
| Supported types | JPEG, PNG, WEBP, GIF, AVIF, TIFF, BMP |
| Storage | Cloudflare R2 (`playmat-studio-hosting-files` bucket) |
| TTL | 7 days (lazy deletion on next GET after expiry) |
| History | Session-scoped (sessionStorage), max 20 items |
| Copy link | Clipboard API |
| Delete | Remove from history (does not delete from R2) |
| Expiry display | Shows expiry date per item |

### Site Features
- Off-canvas mobile navigation
- Smooth-scroll section anchors (hero, how-it-works, features, tools, about, contact)
- Contact form (Cloudflare Worker → Resend API)
- Privacy Policy lightbox
- Changelog lightbox (v1.0.0b – v1.7.1b)
- Back-to-top button
- Custom 404 page
- OG / Twitter Card meta tags
- Sitemap + robots.txt
- Security headers (configured at Cloudflare level)

---

## 5. Backend — Cloudflare Workers

### Worker 1: Contact Form
**Deployed to:** `contact.playmatstudio.com`
**Source:** `contact-worker.js`
**Runtime:** Cloudflare Workers (ES module)

**Accepts:** `POST` with JSON body
```json
{ "name": "string", "email": "string", "message": "string" }
```
**Validates:** All three fields required; email regex; field length limits (name/email: 200 chars, message: 4000 chars)
**Sends via:** Resend API (`https://api.resend.com/emails`)
**From:** `Playmat Studio <noreply@rubicongamesupplies.com>`
**To:** `support@rubicongamesupplies.com`
**Reply-to:** Sender's email
**CORS origins:** `https://playmatstudio.com`, `https://www.playmatstudio.com`
**Secrets required:** `RESEND_API_KEY` (Cloudflare Worker environment variable)
**Responses:** `{ ok: true }` on success; `{ error: "..." }` with appropriate HTTP status on failure

---

### Worker 2: Image Hosting / File Server
**Deployed to:** `files.playmatstudio.com`
**Source:** `playmat-host-worker.js`
**Runtime:** Cloudflare Workers (ES module)
**R2 binding:** `BUCKET1` → bucket `playmat-studio-hosting-files`

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/` | Upload file. FormData field: `file` or `image` |
| `GET` | `/{id}` | Serve file. Lazily deletes if >7 days old |
| `DELETE` | `/{id}` | Delete file from R2 |
| `OPTIONS` | `*` | CORS preflight |

**Upload response:**
```json
{ "ok": true, "url": "https://files.playmatstudio.com/{id}", "id": "{id}", "expires": "ISO8601" }
```
**File naming:** 12-char random alphanumeric ID + extension
**TTL:** 7 days (`TTL_MS = 7 * 24 * 60 * 60 * 1000`)
**Max size:** 50 MB
**Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`, `image/tiff`, `image/bmp`
**R2 key prefix:** `PS File Hosting/`
**CORS origins:** `https://playmatstudio.com`, `https://www.playmatstudio.com`
**Secrets required:** None (R2 bucket binding only)

**Also used for:** Temporary image staging before AI processing (AI workers pull from this URL)

---

### Worker 3: AI Upscaler
**Deployed to:** `https://playmat-upscaler.salve.workers.dev`
**Source:** Not in this repository (referenced as `playmat-r2-upload-worker.js` in comments)
**Runtime:** Cloudflare Workers
**External API:** Replicate (image upscaling model)

**Frontend calls:**
```
POST https://playmat-upscaler.salve.workers.dev
Body: { "image": "<public R2 URL of uploaded image>" }
Response: Replicate prediction object { id, status, output }
Poll: GET https://playmat-upscaler.salve.workers.dev?id={prediction.id}
```
**Polling:** Every 2 seconds, max 30 attempts (60 seconds)
**Terminal statuses:** `succeeded`, `failed`, `canceled`

---

### Worker 4: AI Background Removal
**Deployed to:** `https://playmat-removebg.salve.workers.dev/`
**Source:** Not in this repository
**External API:** Replicate (background removal model)

**Frontend calls:**
```
POST https://playmat-removebg.salve.workers.dev/
Body: { "image": "<public R2 URL of uploaded image>" }
Response: Replicate prediction object { id, status, output }
Poll: GET https://playmat-removebg.salve.workers.dev/?id={prediction.id}
```
**Polling:** Every 2 seconds, max 30 attempts (60 seconds)
**Result:** PNG with alpha channel (transparent background)

---

## 6. Data Flow

### Download Flow
```
User clicks Download
  → downloadDesign(mode)
    → checkArtCoverage() — abort if art doesn't cover bleed and user cancels
    → _executeDownload(mode, btn, activeCanvas)
      → buildPrintCanvas(isAdv, activeCanvas)   [see §8 for detail]
      → canvas.toBlob('image/jpeg', 0.98)
      → injectJpegDpi(blob, 300)               [inject JFIF APP0 DPI metadata]
      → URL.createObjectURL(blob)
      → <a download="playmat-{size}-{ts}.jpg"> .click()
      → URL.revokeObjectURL()
```

### Share Flow
```
User clicks Share
  → shareDesign(mode)
    → buildPrintCanvas()                         [render at 300 DPI]
    → canvas.toBlob('image/jpeg', 0.98)
    → uploadImageToStaging(blob, filename)
      → POST https://files.playmatstudio.com/    [FormData: image=blob]
      → returns { url, id, expires }
    → show #share-result-modal with URL + expiry
```

### AI Upscale Flow
```
User clicks AI Upscaler
  → confirmAutoUpscale(isAdv)                    [show confirmation modal]
  → runAutoUpscale()
    → resize artwork to ≤2M pixels               [toDataURL JPEG 0.85]
    → uploadImageToStaging(blob)                  [POST to files.playmatstudio.com]
    → POST https://playmat-upscaler.salve.workers.dev  [{ image: r2Url }]
    → poll GET ...?id={prediction.id} every 2s
    → on succeeded: fabric.Image.fromURL(output[0])
    → validate result ≥90% original pixel area
    → replace artwork object on canvas
    → updateBleedWarnings()
    → show #ai-success-modal
```

### Contact Form Flow
```
User submits contact form
  → POST https://contact.playmatstudio.com
    Body: { name, email, message }
  → Worker validates, sanitises, calls Resend API
  → Resend sends email to support@rubicongamesupplies.com
    with reply-to set to user's email
```

---

## 7. State Management

### Central APP Object (tool.js lines 43–66)
```javascript
const APP = {
  isMaskMode:          false,    // eraser brush active
  isRecolorMode:       false,    // recolor brush active
  currentZoom:         1,        // workspace zoom (0.5–3)
  currentBrushShape:   'round',  // 'round' | 'square'
  aiFgImg:             null,     // AI foreground Image element
  activeUpscaleEditor: null,     // 'adv' | 'simple'
  activeLayoutUrl:     null,     // current overlay URL (adv)
  erasedPaths:         [],       // array of {size, shape, points[]}
  canvasW:             0,        // canvas pixel width
  canvasH:             0,        // canvas pixel height
  baseArtScale:        1,        // art scale factor (adv)
  cachedLayoutUrl:     null,     // last loaded overlay URL (adv)
  cachedLayoutImg:     null,     // last loaded overlay Image (adv)
  s_activeLayoutUrl:   null,     // current overlay URL (simple)
  s_cachedLayoutImg:   null,     // last loaded overlay Image (simple)
  s_baseArtScale:      1,        // art scale factor (simple)
  activeSizeKey:       'standard', // mat size key
  s_filters:           { enhance: false, grayscale: false },
  activePointsUrl:     null,     // Riftbound points overlay URL
  _bleedConfirmCallback: null,   // callback for bleed modal
};
```

### Legacy Window Properties (lines 69–89)
Maintained as getters/setters on `window` for backward compatibility:
`artImg`, `layoutImg`, `artCanvas`, `overlayCanvas`, `layoutCanvas`, `rCanvas`, `simpleCanvas`, `rbPointsImg`, `simpleArtImg`

### No Framework State
- No Redux, Vuex, or equivalent
- No reactive bindings
- UI is updated imperatively by individual functions
- Canvas objects accessed directly via Fabric.js API

---

## 8. Canvas & Export System

### Mat Sizes — `SIZE_DB` (tool.js lines 97–108)
All print dimensions at 300 DPI:

| Key | Label | Inches | Pixels (W × H) |
|-----|-------|--------|-----------------|
| `standard` | Standard | 24.5 × 14.5" | 7,350 × 4,350 |
| `expanded` | Expanded | 28.5 × 16.5" | 8,550 × 4,950 |
| `extended` | Extended | 28.5 × 14.5" | 8,550 × 4,350 |
| `victor` | Victor | 24.0 × 12.0" | 7,200 × 3,600 |
| `secundus` | Secundus | 28.0 × 12.0" | 8,400 × 3,600 |
| `primus` | Primus | 31.0 × 12.0" | 9,300 × 3,600 |
| `tiro` | Tiro | 10.0 × 8.0" | 3,000 × 2,400 |
| `veteranus` | Veteranus | 12.5 × 10.5" | 3,750 × 3,150 |
| `gladiator` | Gladiator | 18.0 × 12.0" | 5,400 × 3,600 |

### Bleed & Safe Zones (constant for all sizes)
- **Bleed:** 0.25" = **75 px** at 300 DPI
- **Safe area:** 0.75" = **225 px** at 300 DPI
- Guides drawn as coloured rect outlines on a separate canvas layer

### Canvas Layers (Advanced Editor)
1. `#adv-canvas` — Fabric.js canvas; contains artwork object + text/shape objects
2. `#layout-canvas` — 2D canvas; game overlay image drawn here
3. `#recolor-canvas` — 2D canvas; free-draw recolor strokes
4. `#eraser-interaction` — transparent overlay div; captures mouse/touch for eraser paths

### Print Render Pipeline (`buildPrintCanvas`)
Creates a fresh off-screen canvas at full print resolution:
1. Fill background colour (if set)
2. Draw artwork: uses Fabric.js `getScaledWidth/Height` + transforms, drawn directly to 2D context
3. **(Advanced only)** Composite text/shape objects: `setZoom(scale)` on Fabric.js canvas, `renderAll()`, draw to print canvas
4. If layout overlay selected: draw to temp canvas, clip to content area, composite
5. **(Advanced only)** Composite recolor layer at print scale
6. **(Advanced only)** Composite AI foreground layer (`APP.aiFgImg`) at print transforms
7. **(Advanced only)** Replay erased paths at print scale using `ctx.destination-out` composite op
8. Export: `canvas.toBlob('image/jpeg', 0.98)`
9. Inject JFIF DPI header: `injectJpegDpi(blob, 300)` — writes APP0 JFIF segment with `Xdensity=300, Ydensity=300, units=1`

### CORS Proxies for Remote Image Loading
- Primary: `https://wsrv.nl/?url={url}&output=webp`
- Fallback: `https://corsproxy.io/?{url}`
- Final fallback: Load without `crossOrigin` attribute (disables canvas taint protection)

---

## 9. Game Overlay Library

All overlay images hosted at:
`https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/`

### Full Overlay List (`LAYOUT_RAW`, tool.js lines 110–158)

**Magic: the Gathering** (`/MTG Overlays/`)
- 60-card Standard Left/Right Handed
- 60-card Extended Left/Right Handed
- Commander Standard Left/Right Handed
- Commander Extended Left/Right Handed

**Pokemon** (`/Pokemon Overlays/`)
- Standard Left/Right Handed
- Extended Left/Right Handed

**Riftbound** (`/Riftbound Overlays/`)
- Bounded Standard Left/Right
- Unbounded Standard Left/Right
- Rubicon Mod Standard Left/Right
- Regional Solo Mod Standard Left/Right
- Gen Con Solo Standard Left/Right
- Houston Regional Standard Left/Right
- Houston Regional w/ Points Standard Left/Right
- Points Only Standard (empty URL — points-only mode)

**Single-hand games** (`/Main Overlays/`) — Standard size only unless noted:
- One Piece
- Neuroscape (Standard + Extended)
- Star Wars: Unlimited
- Grand Archive
- Gundam
- Union Arena
- Yu-Gi-Oh
- Final Fantasy
- Sorcery: Contested Realm
- SolForge Fusion
- Digimon
- Altered
- Warlord
- Universus

**Lorcana** (`/Main Overlays/`)
- Standard Left/Right Handed

**Flesh and Blood** (`/Main Overlays/`)
- Single Arsenal Standard
- Double Arsenal Standard

### Riftbound Points Overlays (`RB_POINTS_DB`, tool.js lines 160–169)
Base path: `https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound Overlays/Points Overlays/`

| Key | Filename |
|-----|---------|
| `none` | *(empty)* |
| `basic` | Basic Points.webp |
| `basic_1_14` | Basic Points 1-14.webp |
| `project` | Project Points.webp |
| `project_1_14` | Project Points 1-14.webp |
| `lunar` | Lunar Points.webp |
| `lunar_1_14` | Lunar Points 1-14.webp |
| `khasino` | Khasino Points.webp |

---

## 10. CSS Architecture

### File Responsibilities
- `main.css` — Phantom theme base; grid, typography, nav, footer. **Do not modify.**
- `custom.css` — All overrides and site-specific styles. Sections:
  - Responsive layout overrides
  - Brand variables (`--ps-*`)
  - Navigation customisation
  - Hero / landing sections
  - Features grid
  - Tool section wrapper
  - Footer columns
  - Privacy modal
  - Changelog modal (added v1.7.1b)
  - Mat size button group
- `tool.css` — All tool UI styles. Sections:
  - Brand design tokens
  - Editor containers and layouts
  - Sidebar and accordion
  - Canvas column
  - Overlay modals
  - Action button row
  - Responsive breakpoints (`@media (max-width: 900px)`)
  - Toggle switches
  - Batch, converter, hosting panels

### Key CSS Custom Properties
Defined in `tool.css` `:root` — scoped inside `#landing-ui, #adv-backdrop, #simple-backdrop`:

```css
--brand-primary:    #6830BB
--brand-hover:      #30BBAD
--brand-bg:         #0E0A1A
--brand-text-pri:   #f0eeff
--brand-text-sec:   #9888c0
--success-green:    #83BB30
--danger-red:       #BB303E
```

Defined globally in `custom.css`:
```css
--ps-bg:           #0b0912
--ps-surface:      #110e1c
--ps-surface-2:    #181228
--ps-surface-3:    #1e1535
--ps-border:       rgba(220,200,255,0.08)
--ps-purple:       #6830BB
--ps-purple-light: #8a52d4
--ps-teal:         #30BBAD
--ps-text:         #f0eeff
--ps-text-muted:   #9888c0
--ps-text-dim:     #5a4d7a
```

---

## 11. JavaScript Architecture

### Execution Order
1. Inline `<script>` in `<head>`: CSS cache-busting loader (appends `?v={Date.now()}` to CSS hrefs)
2. jQuery, browser.min.js, breakpoints.min.js, util.js
3. `main.js` — nav, scroll, mobile menu
4. `tool.js` — entire tool application (IIFE + window globals)

### tool.js Structure
```
Lines 1–42:     Utility functions (escHtml, sanitizeFilename)
Lines 23–34:    Worker URL constants (window.CLOUDFLARE_*)
Lines 43–89:    APP state object + legacy window property getters
Lines 90–109:   SIZE_DB (mat sizes) + rbPointsImg Image element
Lines 110–169:  LAYOUT_RAW (overlay library) + RB_POINTS_DB
Lines 170–220:  Modal helpers (showAppAlert, etc.)
Lines 221–270:  File upload to R2 (uploadImageToStaging)
Lines 271–342:  Riftbound overlay drawing (drawRiftboundLayout)
Lines 342–470:  Filter functions, auto-optimise, rotate, colour adjust
Lines 471–630:  UI init, tab system, editor open/close, game dropdowns
Lines 631–692:  URL paste, remote image loading, CORS proxies
Lines 693–815:  AI upscale flow
Lines 815–900:  Simple editor canvas init + controls
Lines 900–1042: Advanced editor canvas init + controls
Lines 1042–1100: Canvas management (changeSize, guides, Riftbound points)
Lines 1100–1200: Advanced editor AI frame break, foreground rendering
Lines 1200–1365: Layout/overlay system (filterFormats, renderLayout, etc.)
Lines 1365–1660: Export/print pipeline (buildPrintCanvas, download, share)
Lines 1660–1770: Download/share entry points and bleed check
Lines 1770–1900: Batch enhance tool
Lines 1900–2040: Format converter tool
Lines 2040–2170: Image hosting tool
Lines 2170–2300: Share/print modal logic
Lines 2300–2472: initEventListeners() — all DOM event bindings
```

### Key Global Assignments on `window`
- `window.CLOUDFLARE_WORKER_URL` — upscaler worker URL
- `window.CLOUDFLARE_BG_WORKER_URL` — bg removal worker URL
- `window.CLOUDFLARE_UPLOAD_URL` — R2 upload worker URL
- `window.CLOUDFLARE_HOST_URL` — image hosting worker URL
- `window.RB_POINTS_DB` — Riftbound points overlay map
- `window.triggerAdvancedFlow` — called from HTML onclick
- `window.triggerSimpleFlow` — called from HTML onclick
- `window.restartApp` — called from HTML onclick
- `window.selectMatSize` — called from HTML onclick
- `window.switchTab` — called from HTML onclick
- `window.filterFormats`, `window.filterSimpleFormats` — dropdown handlers
- All Fabric.js canvas references: `window.artCanvas`, `window.layoutCanvas`, etc.

---

## 12. All Hardcoded Values

### Worker / API URLs
```javascript
window.CLOUDFLARE_WORKER_URL    = 'https://playmat-upscaler.salve.workers.dev';
window.CLOUDFLARE_BG_WORKER_URL = 'https://playmat-removebg.salve.workers.dev/';
window.CLOUDFLARE_UPLOAD_URL    = 'https://files.playmatstudio.com/';
window.CLOUDFLARE_HOST_URL      = 'https://files.playmatstudio.com';
```
```javascript
// Contact worker (index.html inline script)
var CONTACT_WORKER = 'https://contact.playmatstudio.com';
```

### CORS Proxies
```javascript
`https://wsrv.nl/?url=${encodeURIComponent(url)}&output=webp`
`https://corsproxy.io/?${encodeURIComponent(url)}`
```

### Overlay Asset Base URL
```
https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/
```

### Contact / Email Addresses
```javascript
// contact-worker.js
const TO_EMAIL   = 'support@rubicongamesupplies.com';
const FROM_EMAIL = 'Playmat Studio <noreply@rubicongamesupplies.com>';
```

### Canvas Dimensions (at 300 DPI)
- Bleed: **75 px** (0.25")
- Safe zone: **225 px** (0.75")
- All mat sizes: see §8

### Export Quality
```javascript
canvas.toBlob('image/jpeg', 0.98)  // Print export
canvas.toBlob('image/jpeg', 0.85)  // AI processing upload
canvas.toDataURL('image/jpeg', 0.95) // Batch enhance
canvas.toBlob('image/webp', 0.95)  // Format converter (WEBP)
canvas.toBlob('image/png')          // Format converter (PNG, lossless)
```

### AI Processing Limits
```javascript
const MAX_UPSCALE_PX   = 2_000_000;   // 2 MP — resize before upscale if larger
const MAX_FRAMEBK_PX   = 2_500_000;   // 2.5 MP — resize before bg removal if larger
const POLL_INTERVAL_MS = 2000;         // 2 seconds
const POLL_MAX_ATTEMPTS = 30;          // 60 second total timeout
```

### Auto-Optimise Values
```javascript
brightness: 12   // +12%
contrast:   8    // +8%
saturation: 15   // +15%
```

### File Hosting
```javascript
const TTL_MS   = 7 * 24 * 60 * 60 * 1000;  // 7 days
const MAX_SIZE = 50 * 1024 * 1024;           // 50 MB
const MAX_HISTORY_ITEMS = 20;                // sessionStorage limit
```

### Site URLs
```
https://playmatstudio.com
mailto:support@rubicongamesupplies.com
```

---

## 13. Storage Usage

### sessionStorage
| Key | Type | Contents |
|-----|------|----------|
| `ps_hosted_images` | JSON array | Upload history, max 20 items. Each: `{ url, id, expires, name, uploadedAt }` |

### localStorage
Not used anywhere in the application.

### Cookies
Not used.

### In-Memory Only
All editor state (canvas objects, filters, overlay selections, eraser paths) is held in memory and lost on page reload. `restartApp()` calls `location.reload()`.

---

## 14. External Dependencies

### Runtime Dependencies
| Dependency | Source | Version | SRI Protected |
|-----------|--------|---------|---------------|
| Fabric.js | cdnjs CDN | 5.3.1 | Yes |
| JSZip | cdnjs CDN | 3.10.1 | Yes |
| jQuery | Self-hosted | 3.x | No |
| Font Awesome | Self-hosted CSS | 6.x | No |
| Google Fonts | fonts.googleapis.com | — | No |
| Resend API | api.resend.com | — | Server-side only |
| Replicate API | replicate.com (via workers) | — | Server-side only |

### External Image Sources
| Source | Purpose |
|--------|---------|
| `pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev` | All game overlay WEBP images |
| `files.playmatstudio.com` | Hosted user images (R2, 7-day TTL) |
| `wsrv.nl` | CORS proxy for user-provided image URLs |
| `corsproxy.io` | Fallback CORS proxy |

---

## 15. Known Issues & Incomplete Code

### Dead Code in `restartApp()` (tool.js ~line 506)
```javascript
window.restartApp = () => {
  location.reload();
  return;
  // ~50 lines of cleanup logic below that never executes
};
```
The entire cleanup block (resetting canvas objects, hiding panels, clearing state) is unreachable. Works fine in practice since `reload()` achieves the same result, but the dead code is misleading.

### Security Audit Findings (2026-03-12)
From `audits/security-audit-2026-03-12.md` — 16 total findings, fixes in progress:
- **C1 (Critical):** XSS via `innerHTML` with user-controlled content (filenames, URLs) in `showAppAlert()`, batch result cards, upload history cards
- **C2 (Critical):** *(see audit file)*
- 4 High, 5 Medium, 5 Low findings — see full audit file

### CSS Cache-Busting via `Date.now()`
Stylesheets are loaded with `?v=${Date.now()}` appended on every page load. This prevents any browser or CDN caching and will also prevent service worker pre-caching (relevant for a PWA build). Would need to change to a fixed version string (e.g. `?v=8`) before a service worker can be added.

### Shopify Code Remnants
Comments in tool.js reference a removed Shopify Liquid variant ID injection:
```javascript
// Liquid-injected fallback variant ID (Shopify) — removed in standalone build
```
This indicates the tool was previously adapted from (or prototyped for) Shopify. The infrastructure for variant IDs has been removed but the comment remains.

### Missing Worker Source Files
`contact-worker.js` and `playmat-host-worker.js` are present. The AI workers are not:
- `playmat-r2-upload-worker.js` — referenced in comments but not in repository
- Upscaler worker source — not in repository
- Background removal worker source — not in repository

---

## 16. Shopify Conversion Notes

### What a Shopify App Is vs. What This Is
This is currently a **static website** hosted on GitHub Pages. A Shopify app is either:
- A **public app** (listed in Shopify App Store, OAuth-authenticated)
- A **custom app** (installed on one store, uses Admin API token)

The tools don't interact with Shopify data today — but if the goal is to sell custom mats directly from a Shopify storefront (product page with the editor embedded), the model would be a **Shopify theme app extension** or an **embedded app**.

---

### Option A: Shopify Theme App Extension (Recommended for storefront embedding)
Embed the tools as a section/block inside a Shopify product page.

**What changes:**
| Item | Change required |
|------|----------------|
| Hosting | Tool JS/CSS served via Shopify CDN or your own CDN; no GitHub Pages |
| HTML structure | Extract tool section from `index.html`; wrap as Liquid `section` |
| Nav/footer | Removed — Shopify theme provides these |
| Contact form | Replace with Shopify native contact form or keep worker |
| Variant selection | Re-add Liquid variant ID injection (remnants already in tool.js comments) |
| Add to cart | Replace download button with Shopify Cart API call |
| File delivery | Upload design to R2, attach URL to cart item properties |
| CSS loading | Reference files from app CDN; remove `Date.now()` cache-busting |
| Workers | Keep all Cloudflare Workers unchanged — just update CORS allowed origins |
| `restartApp()` | Fix dead code — must not call `location.reload()` inside a Shopify page |

**What stays the same:**
- All canvas logic, overlays, export pipeline — zero changes needed
- All Cloudflare Workers — just add Shopify domain to CORS `ALLOWED_ORIGINS`
- Fabric.js, JSZip, all tool features

---

### Option B: Shopify Embedded App (Admin panel tool)
Build a standalone web app authenticated via Shopify OAuth, embedded in the Shopify admin.

**Additional requirements over Option A:**
- Shopify Partner account + app registration
- OAuth flow (Shopify App Bridge)
- `shopify.app.toml` configuration
- Node.js / Remix / Next.js app server (or equivalent)
- Shopify App Bridge for iframe embedding in admin

This is significantly more infrastructure than Option A and isn't necessary if the goal is just embedding the editor on a product page.

---

### Merge Checklist (Before Shopify Conversion)

When merging with the second version, verify which version has the canonical copy of:

- [ ] `LAYOUT_RAW` — game overlay list (likely different between versions)
- [ ] `SIZE_DB` — mat size definitions (may differ)
- [ ] `RB_POINTS_DB` — Riftbound points overlays
- [ ] Worker URLs — are they the same workers or different deployments?
- [ ] Overlay asset R2 bucket URL — same public bucket or two different ones?
- [ ] `tool.js` — compare function-by-function; the other version may have diverged significantly
- [ ] `tool.css` — compare responsive breakpoints especially
- [ ] `custom.css` — branding and layout customisations
- [ ] AI worker source files — obtain the missing worker source from the other repo
- [ ] Security audit fixes — determine which version has more fixes applied
- [ ] Dead code in `restartApp()` — fix in merged version
- [ ] `innerHTML` XSS vectors — fix before deploying merged version

### Shopify CORS Update (Required)
Add Shopify store domain(s) to `ALLOWED_ORIGINS` in both workers:
```javascript
// contact-worker.js + playmat-host-worker.js
const ALLOWED_ORIGINS = [
  'https://playmatstudio.com',
  'https://www.playmatstudio.com',
  'https://your-shopify-store.myshopify.com',  // add this
  'https://your-custom-shopify-domain.com',    // and this if applicable
];
```

### Variant ID Integration (cart line item)
The code previously had Liquid variable injection. To re-add:
```javascript
// In tool.js, replace download logic with:
// 1. Upload design to R2 → get URL
// 2. POST to Shopify Cart API:
fetch('/cart/add.js', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: variantId,           // from Liquid: {{ product.selected_or_first_available_variant.id }}
    quantity: 1,
    properties: {
      '_design_url': designUrl,    // R2 hosted URL
      '_mat_size':   APP.activeSizeKey,
      '_game':       selectedGame,
    }
  })
});
```

### File Delivery to Printer
Once a customer completes their order, you'll need a fulfilment workflow that:
1. Reads the `_design_url` order line item property
2. Downloads the file from R2 (before 7-day expiry) and stores it permanently
3. Sends to print vendor (or triggers vendor API)

This is the main backend piece that doesn't exist yet.
