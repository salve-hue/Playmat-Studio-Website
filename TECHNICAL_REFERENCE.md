# Playmat Studio — Technical Reference Document

**Version:** 1.7.2b
**Last Updated:** 2026-03-24
**Domain:** playmatstudio.com
**Architecture:** Static Single-Page Application (SPA)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Directory Structure](#2-directory-structure)
3. [Tech Stack & Dependencies](#3-tech-stack--dependencies)
4. [Infrastructure & Backend](#4-infrastructure--backend)
5. [CSS Architecture & Design Tokens](#5-css-architecture--design-tokens)
6. [Page Structure & HTML Sections](#6-page-structure--html-sections)
7. [Tool Features & Functionality](#7-tool-features--functionality)
8. [JavaScript Architecture](#8-javascript-architecture)
9. [Fabric.js Canvas Integration](#9-fabricjs-canvas-integration)
10. [Forms & Input Reference](#10-forms--input-reference)
11. [SEO, Meta & Social Tags](#11-seo-meta--social-tags)
12. [Responsive Breakpoints](#12-responsive-breakpoints)
13. [Configuration Files](#13-configuration-files)
14. [Security Audit Summary](#14-security-audit-summary)
15. [Deployment & Hosting](#15-deployment--hosting)
16. [Known Issues & Pending Work](#16-known-issues--pending-work)

---

## 1. Project Overview

Playmat Studio is a **free, browser-based image preparation tool** built for tabletop game players who want to design and print custom playmats. It requires no installation, no account, and no cost to use.

**Core Value Proposition:**
- Upload artwork → customize with game overlays → download a print-ready 300 DPI file
- All image processing runs entirely in the browser via HTML5 Canvas + Fabric.js
- Optional cloud AI features (upscaling, background removal) via Cloudflare Workers

**Business Context:**
- Community-driven project; no ads, fees, or accounts required
- Email contact goes to `support@rubicongamesupplies.com`
- No analytics or tracking of any kind

---

## 2. Directory Structure

```
/Playmat-Studio-Website/
├── index.html                         # Main app (~1625 lines)
├── 404.html                           # Custom error page
├── contact-worker.js                  # Cloudflare Worker: email via Resend
├── playmat-host-worker.js             # Cloudflare Worker: R2 image hosting
├── CNAME                              # Domain: playmatstudio.com
├── robots.txt                         # Allow all; points to sitemap
├── sitemap.xml                        # Single-page sitemap
├── .htaccess                          # Apache: security headers + cache rules
├── README.txt                         # Phantom template credits (HTML5 UP)
├── LICENSE.txt                        # CCA 3.0 license
│
├── assets/
│   ├── css/
│   │   ├── main.css                   # 58 KB — Phantom template base styles
│   │   ├── custom.css                 # 36 KB — Brand overrides & custom UI
│   │   ├── tool.css                   # 36 KB — Tool editor UI styling
│   │   ├── fontawesome-all.min.css    # 59 KB — Font Awesome 6.x icons
│   │   └── noscript.css               # 296 B  — No-JS fallback
│   ├── js/
│   │   ├── jquery.min.js              # 88 KB  — jQuery 3.x
│   │   ├── browser.min.js             # 2 KB   — Browser detection (Phantom)
│   │   ├── breakpoints.min.js         # 2 KB   — Breakpoint utility (Phantom)
│   │   ├── util.js                    # 13 KB  — Misc utilities (Phantom)
│   │   ├── main.js                    # 3.5 KB — Menu & contact form logic
│   │   └── tool.js                    # 166 KB / 2873 lines — All tool logic
│   ├── webfonts/                      # Font Awesome icon fonts (eot/svg/ttf/woff/woff2)
│   ├── Under Subway.ttf               # Custom branding font (115 KB)
│   └── sass/                          # Source SCSS (not compiled on deploy)
│
├── images/
│   ├── logo.svg                       # Primary logo (used in header & footer)
│   ├── Logo-PS.svg                    # Alternate logo asset
│   ├── favicon.svg                    # Browser tab favicon
│   ├── apple-touch-icon.png           # iOS home screen icon
│   ├── og-preview.jpg                 # Open Graph / Twitter Card preview image
│   └── pic01.jpg – pic15.jpg          # Demo / placeholder images
│
├── b2b-handoff/                       # White-label B2B platform project brief
│   ├── CLAUDE.md                      # Master context file for a new Claude project
│   ├── PROJECT_SPEC.md                # Full feature spec, DB schema, user flows
│   └── STARTER_CODE.md                # Bootstrap commands and starter code files
│
└── audits/
    └── security-audit-2026-03-12.md   # 16 findings (2 critical, 4 high)
```

---

## 3. Tech Stack & Dependencies

### Frontend (Self-Hosted)
| Asset | Version | Size | Purpose |
|---|---|---|---|
| jQuery | 3.x | 88 KB | DOM manipulation, AJAX |
| Font Awesome | 6.x | 59 KB CSS + fonts | Icons throughout UI |
| Under Subway | — | 115 KB TTF | Logo/brand font |
| Phantom Template | — | base | Layout framework (HTML5 UP) |

### Frontend (CDN with SRI)
| Library | Version | CDN | SRI Hash |
|---|---|---|---|
| Fabric.js | 5.3.1 | cdnjs.cloudflare.com | `sha384-sLpuECXY...` |
| JSZip | 3.10.1 | cdnjs.cloudflare.com | `sha384-+mbV2IY1...` |

### Google Fonts (Variable)
- **Plus Jakarta Sans** — 200–800 weight (primary UI font)
- **Rubik** — 300–900 weight (secondary UI)
- **Decorative/Game fonts:** Bangers, Cinzel, Dancing Script, Oswald, Pacifico, Permanent Marker, Press Start 2P, Roboto, Shadows Into Light

### CSS Loading (Cache-Busted)
CSS is injected via an inline script rather than static `<link>` tags to enable cache-busting:
```javascript
// In <head> — appends ?v=<timestamp> to all CSS filenames
['main', 'custom', 'tool'].forEach(function(n) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'assets/css/' + n + '.css?v=' + Date.now();
    document.head.appendChild(l);
});
```

### Third-Party CORS Proxies
- `https://wsrv.nl/?url=...` — Image resizing/optimization proxy
- `https://corsproxy.io/?...` — General CORS workaround for external URLs

---

## 4. Infrastructure & Backend

All backend logic runs as **Cloudflare Workers**. The main site is static (GitHub Pages or similar CDN).

### Cloudflare Worker Endpoints

| Purpose | URL | File |
|---|---|---|
| AI Upscaler | `https://playmat-upscaler.salve.workers.dev` | (external) |
| Background Removal | `https://playmat-removebg.salve.workers.dev/` | (external) |
| Image Hosting (R2) | `https://files.playmatstudio.com/` | `playmat-host-worker.js` |
| Contact Form Email | `https://contact.playmatstudio.com` | `contact-worker.js` |

### Contact Worker (`contact-worker.js`)
- **Method:** POST with JSON body `{ name, email, message }`
- **Email provider:** Resend API (env var: `RESEND_API_KEY`)
- **Destination:** `support@rubicongamesupplies.com`
- **Reply-to:** User's submitted email
- **CORS allowed origins:** `https://playmatstudio.com`, `https://www.playmatstudio.com`
- **Validation:** HTML-escapes `&<>"'`; limits name/email to 200 chars, message to 4000 chars
- **Returns:** JSON `{ success: true }` or `{ error: "..." }`

### Image Hosting Worker (`playmat-host-worker.js`)
- **Storage:** Cloudflare R2 bucket named `playmat-studio-hosting-files`
- **TTL:** 7 days; lazy-deleted on access after expiry
- **Max file size:** 50 MB
- **Allowed MIME types:** image/jpeg, image/png, image/webp, image/gif, image/avif, image/tiff, image/bmp
- **Returns on upload:** `{ ok: true, url, id, expires }`
- **Upload history:** Stored in browser `localStorage` (no server-side user tracking)

### AI Workers (External, Not in Repo)
Both AI workers call the **Replicate API** internally:
- **Upscaler:** Enhances image resolution
- **Background Removal:** Isolates foreground subject
- Both are called only on explicit user confirmation (modal prompt first)

---

## 5. CSS Architecture & Design Tokens

CSS is organized in three layers:
1. `main.css` — Phantom template base (do not edit heavily)
2. `custom.css` — Brand overrides, section layouts, component styles
3. `tool.css` — Tool editor UI (modals, canvas, sidebar, controls)

### Design Tokens (CSS Custom Properties)

Defined in `custom.css` (`:root`) and `tool.css`:

```css
/* Backgrounds */
--ps-bg:           #0b0912;           /* Page background */
--ps-surface:      #110e1c;           /* Card/panel surface */
--ps-surface-2:    #181228;           /* Elevated/nested surface */
--ps-border:       rgba(220, 200, 255, 0.08);

/* Brand Colors */
--ps-purple:       #6830BB;           /* Primary action / CTA */
--ps-purple-soft:  #8565B5;           /* Hover state */
--ps-purple-dark:  #521898;           /* Pressed state */
--ps-purple-light: #8a52d4;           /* Light variant */
--ps-link-hover:   #a07fe0;           /* Link hover (AA contrast) */

--ps-red:          #BB303E;           /* Error / danger */
--ps-green:        #83BB30;           /* Success */
--ps-teal:         #30BBAD;           /* Interactive accent / info */
--ps-teal-dark:    #22988C;           /* Teal hover */

/* Typography */
--ps-text:         #f0eeff;           /* Primary text */
--ps-text-muted:   #9888c0;           /* Secondary/muted text */

/* Layout */
--adv-nav-offset:  64px;              /* Fixed header height */
```

**Tool-specific aliases (tool.css):**
```css
--brand-primary:   #6830BB;           /* = --ps-purple */
--brand-hover:     #30BBAD;           /* = --ps-teal */
--brand-bg:        #181228;           /* = --ps-surface-2 */
--brand-text-pri:  #f0eeff;           /* = --ps-text */
--brand-text-sec:  #9888c0;           /* = --ps-text-muted */
--success-green:   #83BB30;           /* = --ps-green */
--danger-red:      #BB303E;           /* = --ps-red */
```

### Typography
- **Brand/Logo:** `'Under Subway'` (self-hosted TTF)
- **Primary UI:** `'Plus Jakarta Sans'` (Google Fonts variable)
- **Secondary UI:** `'Rubik'` (Google Fonts variable)
- **Game text overlays:** Bangers, Cinzel, Dancing Script, Oswald, Pacifico, Permanent Marker, Press Start 2P, Shadows Into Light

---

## 6. Page Structure & HTML Sections

### Top-Level Layout
```
#wrapper
  ├── #header           — Fixed sticky navigation bar
  ├── #menu             — Off-canvas mobile menu
  ├── #main             — Hero section
  ├── #how-it-works     — Three-step explainer
  ├── #features         — Feature tile grid
  ├── #tools            — Tool embed (main app)
  ├── #about            — About section
  ├── #contact          — Contact form
  └── #footer           — Footer (links, branding, copyright)
```

### Section Details

| ID | Type | Purpose |
|---|---|---|
| `#header` | `<header>` | Fixed nav; contains logo + nav links + hamburger |
| `#menu` | `<nav>` | Off-canvas mobile nav (shown ≤980px) |
| `#main` | `<section>` | Hero: "Your Custom Playmat Starts Here" tagline + CTA |
| `#how-it-works` | `<section>` | 3-step process overview |
| `#features` | `<section>` | 6-tile feature grid (uses `.tiles` CSS grid) |
| `#tools` | `<section>` | Inline tool embed (NOT an iframe) |
| `#about` | `<section>` | Project description + community messaging |
| `#contact` | `<section>` | Contact form + status message |
| `#footer` | `<footer>` | Brand column + links column + copyright |
| `#back-to-top` | `<button>` | Fixed scroll-to-top; visible after 400px scroll |

### Tool Modals / Overlays

| ID | Purpose |
|---|---|
| `#simple-backdrop` | Quick Upload editor lightbox |
| `#adv-backdrop` | Advanced Editor lightbox |
| `#app-alert-modal` | Generic notification overlay |
| `#dpi-warning-modal` | Low-resolution image warning |
| `#ai-warning-modal` | AI feature confirmation prompt |
| `#ai-upscale-modal` | Upscaler-specific confirmation |
| `#ai-success-modal` | AI processing success message |
| `#url-paste-modal` | Import image from URL dialog |
| `#help-modal` | In-app help/documentation |
| `#bleed-confirm-modal` | Artwork bleed/coverage warning |
| `#share-result-modal` | Share design via hosted link |
| `#get-printed-modal` | Print service referral link |
| `#privacy-modal` | Privacy policy lightbox |

### Tool Tab Panels

| ID | Tab Label |
|---|---|
| `#tab-panel-quick-upload` | Quick Upload |
| `#tab-panel-adv-editor` | Advanced Editor |
| `#tab-panel-batch` | Batch Enhance |
| `#tab-panel-converter` | Format Converter |
| `#tab-panel-host` | Image Hosting |

---

## 7. Tool Features & Functionality

### Quick Upload
Simple single-image editor for fast turnaround:
- Upload image → auto-fit to mat canvas → download at 300 DPI
- Controls: zoom slider, rotate buttons, fit-to-canvas
- Filters: enhance (auto-color correct), grayscale
- Print guides: bleed/safe zone overlays
- Optional game layout overlays (same DB as Advanced Editor)
- Output format: JPG (print-ready)

### Advanced Editor (Beta)
Full-featured Fabric.js canvas editor with split layout:
- **Left sidebar (300px):** Collapsible accordion cards — Artwork, Game Layout, Adjustments, Text (each section is an independent scrollable card)
- **Center canvas:** Zoomable Fabric.js canvas with floating toolbar
- **AI features:** Upscale resolution, remove background (both require confirmation modal)
- **Manual editing:** Eraser brush (size 10–150px), Recolor brush (5–100px)
- **Text overlay:** Font selection from 9+ display fonts, color, stroke, size, position
- **Transformations:** Flip H/V, rotate, zoom (0.1–2.5x), gradient overlay
- **Color adjustments:** Brightness, contrast, saturation, vibrance sliders + image presets with tooltips
- **Canvas export:** JPG 99% quality, PNG lossless, WEBP 95%, all at 300 DPI
- **Slider guards:** Track clicks are blocked (must grab thumb); wheel and vertical touch swipe scroll the page instead of changing the slider value

### Batch Enhance
- Drag-and-drop or click to upload multiple images
- Auto color correction applied to all
- Download individual files or all as a ZIP (JSZip)

### Format Converter
- Convert between JPG, PNG, WEBP
- Batch processing supported
- Single file or ZIP download

### Image Hosting
- Upload image to Cloudflare R2 bucket
- Returns shareable URL (7-day expiry)
- Max 50 MB per upload
- Upload history tracked in `localStorage`
- Auto-deletes expired entries on access

### Game Overlay System
`LAYOUT_RAW` array contains **48+ predefined overlay templates** including:
- Magic: The Gathering (60-card, Commander)
- Pokémon
- Riftbound (with configurable points via `RB_POINTS_DB`)
- One Piece, Neuroscape, Star Wars: Unlimited, Grand Archive, and more
- Each entry: `{ key, label, url, game, format, hand }`
- Filtered in-UI by game → format → handedness dropdowns

### Mat Size Database (`SIZE_DB`)
```javascript
"standard":   { w: 24.5, h: 14.5, label: '24" x 14"' }
"expanded":   { w: 28.5, h: 16.5, label: '28" x 16"' }
"extended":   { w: 28.5, h: 14.5, label: '28" x 14"' }
// + Victor, Secundus, Primus, Tiro, Veteranus, Gladiator
```

---

## 8. JavaScript Architecture

### File Responsibilities

| File | Responsibility |
|---|---|
| `main.js` | Nav menu toggle, breakpoint setup, contact form POST |
| `tool.js` | All tool logic (2873 lines) — editors, AI calls, export, overlays |
| `jquery.min.js` | DOM/AJAX base |
| `browser.min.js` | User-agent detection (Phantom) |
| `breakpoints.min.js` | Responsive JS breakpoints |
| `util.js` | Misc Phantom utilities |

### Global State Object (`tool.js`)
```javascript
const APP = {
    isMaskMode,          // Boolean: eraser active
    isRecolorMode,       // Boolean: recolor brush active
    currentZoom,         // Number: canvas zoom level
    currentBrushShape,   // String: 'circle' | 'square'
    aiFgImg,             // Fabric image: AI-extracted foreground
    activeUpscaleEditor, // String: which editor called upscale
    activeLayoutUrl,     // String: current overlay URL
    erasedPaths,         // Array: eraser path history
    canvasW, canvasH,    // Number: canvas dimensions in px
    baseArtScale,        // Number: initial art fit scale
    activeSizeKey,       // String: current mat size key
    // ...
}
```

### Window-Level API
```javascript
window.CLOUDFLARE_WORKER_URL       // Upscaler endpoint
window.CLOUDFLARE_BG_WORKER_URL    // Background removal endpoint
window.CLOUDFLARE_UPLOAD_URL       // R2 upload endpoint
window.CLOUDFLARE_HOST_URL         // R2 public serving URL

window.showAppAlert(title, msg, type, retryFn)   // Trigger modal alert
window.checkArtCoverage(fabricCanvas)            // Check bleed coverage
window.updateBleedWarnings(fabricCanvas)         // Refresh bleed UI
window.buildPrintFilename()                      // Generate unique filename
window.RB_POINTS_DB                              // Riftbound points overlay data
```

---

## 9. Fabric.js Canvas Integration

### Configuration
```javascript
fabric.Object.prototype.objectCaching = false;  // Disable for performance
fabric.textureSize = 16384;                      // Max texture size
```

### Canvas Elements

**Quick Upload editor:**
| Canvas ID | Purpose |
|---|---|
| `#s-main-canvas` | Primary art canvas |
| `#s-layout-canvas` | Game overlay layer |

**Advanced Editor:**
| Canvas ID | z-index | Purpose |
|---|---|---|
| `#main-canvas` | (Fabric) | Primary art canvas |
| `#vignette-canvas` | 5 | Vignette / gradient overlay layer (below game overlay) |
| `#layout-canvas` | 10 | Game overlay layer |
| `#fg-canvas` | 20 | AI foreground layer |
| `#recolor-canvas` | 30 | Recolor brush layer |
| `#eraser-interaction` | 40 | Eraser pointer event capture |

### Named Fabric Objects
- `'art'` — Main user-uploaded image object
- Named overlays per Riftbound layout template

### Export Pipeline
1. Merge all canvas layers into single HTMLCanvasElement
2. Set canvas width/height to print dimensions (DPI × inches)
3. Export via `canvas.toBlob()`:
   - JPG: 99% quality
   - PNG: lossless
   - WEBP: 95% quality
4. Inject 300 DPI metadata into file headers
5. Trigger browser download via programmatic `<a>` click

---

## 10. Forms & Input Reference

### Contact Form (`#contact-form`)
| Element | ID | Type |
|---|---|---|
| Name field | `#contact-name` | `input[type=text]` |
| Email field | `#contact-email` | `input[type=email]` |
| Message | `#contact-message` | `textarea` |
| Submit | `#contact-submit` | `button[type=submit]` |
| Status display | `#contact-status` | `div[aria-live=polite]` |

### File Inputs (all hidden, triggered by buttons)
| ID | Tool |
|---|---|
| `#simple-file-in` | Quick Upload |
| `#adv-file-in` | Advanced Editor |
| `#batch-file-in` | Batch Enhance |
| `#converter-file-in` | Format Converter |
| `#host-file-in` | Image Hosting |

### Select Dropdowns
| ID | Purpose |
|---|---|
| `#s-game-sel` / `#game-sel` | Game overlay selection |
| `#s-format-sel` / `#format-sel` | Format (60-card, Commander, etc.) |
| `#s-hand-sel` / `#hand-sel` | Handedness (Left/Right) |
| `#s-rb-points-sel` / `#rb-points-sel` | Riftbound points overlay |
| `#converter-format-sel` | Output format (JPG / PNG / WEBP) |

### Range Sliders
| ID | Range | Purpose |
|---|---|---|
| `#s-zoom-in` / `#zoom-in` | 0.1–2.5 | Canvas zoom |
| `#filter-brightness` | — | Brightness adjustment |
| `#filter-contrast` | — | Contrast adjustment |
| `#filter-saturation` | — | Saturation adjustment |
| `#brush-size` | 10–150 px | Eraser brush size |
| `#recolor-size` | 5–100 px | Recolor brush size |
| `#angle-in` | 0–360° | Gradient angle |
| `#op-in` | 0.1–1 | Overlay opacity |

### Color Pickers
| ID | Purpose |
|---|---|
| `#s-col` | Quick Upload zone color |
| `#col-1` / `#col-2` | Advanced Editor zone colors |
| `#bg-color-picker` | Canvas background fill |
| `#recolor-color` | Recolor brush color |
| `#adv-text-col` | Text overlay fill color |
| `#adv-text-stroke` | Text overlay stroke color |

---

## 11. SEO, Meta & Social Tags

```html
<title>Playmat Studio — Your Custom Playmat Starts Here</title>
<meta name="description" content="Free browser-based tools to design, enhance,
  and download print-ready game mat artwork. No installs. No account. No cost." />

<!-- Favicons -->
<link rel="icon" type="image/svg+xml" href="images/favicon.svg" />
<link rel="apple-touch-icon" href="images/apple-touch-icon.png" />

<!-- Open Graph -->
<meta property="og:type"        content="website" />
<meta property="og:url"         content="https://playmatstudio.com/" />
<meta property="og:title"       content="Playmat Studio — Your Custom Playmat Starts Here" />
<meta property="og:description" content="..." />
<meta property="og:image"       content="https://playmatstudio.com/images/og-preview.jpg" />

<!-- Twitter Card -->
<meta name="twitter:card"        content="summary_large_image" />
<meta name="twitter:title"       content="..." />
<meta name="twitter:description" content="..." />
<meta name="twitter:image"       content="https://playmatstudio.com/images/og-preview.jpg" />
```

**robots.txt:** `Allow: /` — all bots welcome; sitemap declared.
**sitemap.xml:** Single URL entry — `https://playmatstudio.com/` (priority 1.0, monthly).

---

## 12. Responsive Breakpoints

Defined in `main.js` via the Phantom `breakpoints()` utility:

| Name | Range | Key Behaviors |
|---|---|---|
| `xlarge` | 1281–1680px | Full layout |
| `large` | 981–1280px | Full layout |
| `medium` | 737–980px | Hamburger menu |
| `small` | 481–736px | Single-column; tool tabs → 2-col grid |
| `xsmall` | 361–480px | Compact spacing |
| `xxsmall` | ≤360px | Minimal layout |

**Key breakpoint behaviors:**
- **≤980px:** Nav links hidden; hamburger (`#menu`) shown
- **≤900px:** Advanced Editor → stacked layout (canvas above sidebar)
- **≤736px:** Single-column sections; tool tabs reflow; buttons stack; ARTWORK accordion collapsed by default

---

## 13. Configuration Files

### `.htaccess`
```apache
ErrorDocument 404 /404.html

# Security headers
Header set X-Frame-Options "SAMEORIGIN"
Header set X-Content-Type-Options "nosniff"
Header set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header set Referrer-Policy "strict-origin-when-cross-origin"
Header set Permissions-Policy "camera=(), microphone=(), geolocation=()"
Header set Content-Security-Policy "default-src 'self'; ..."

# Cache control
# HTML: no-cache, no-store, must-revalidate
# CSS/JS: public, max-age=31536000, immutable (1 year)
# Images: public, max-age=2592000 (30 days)
```

### `CNAME`
```
playmatstudio.com
```

### `robots.txt`
```
User-agent: *
Allow: /
Sitemap: https://playmatstudio.com/sitemap.xml
```

### `sitemap.xml`
```xml
<url>
  <loc>https://playmatstudio.com/</loc>
  <lastmod>2026-03-12</lastmod>
  <changefreq>monthly</changefreq>
  <priority>1.0</priority>
</url>
```

---

## 14. Security Audit Summary

**Audit file:** `audits/security-audit-2026-03-12.md`
**Total findings: 16** (2 Critical, 4 High, 5 Medium, 5 Low)

### Critical
| ID | Issue |
|---|---|
| C1 | XSS via `innerHTML` — user content (filenames, URLs) not sanitized before DOM insertion |
| C2 | No Content Security Policy — XSS impact is unrestricted |

### High
| ID | Issue |
|---|---|
| H1 | CDN scripts without SRI — Fabric.js & JSZip load without integrity checks *(Note: SRI was present at time of writing; verify if still correct)* |
| H2 | Worker API URLs exposed — callable directly with no rate limiting or auth |
| H3 | Arbitrary URLs via CORS proxies — SSRF-by-proxy risk |
| H4 | Upload history in `localStorage` — plaintext, no TTL enforcement client-side |

### Medium
| ID | Issue |
|---|---|
| M1 | Missing security response headers (partially addressed in `.htaccess`) |
| M2 | URL parameters built via string concatenation (should use `URLSearchParams`) |
| M3 | Filenames not sanitized — injectable chars passed to file renders |
| M4 | Permissive CORS on R2 worker (`Allow-Origin: *`) |
| M5 | No rate limiting on R2 worker — DOS/quota exhaustion risk |

### Low
| ID | Issue |
|---|---|
| L1 | `document.write()` used for stylesheet injection — deprecated, blocks parsing |
| L2 | Verbose `console.error` in production — leaks internals to DevTools |
| L3 | No `Permissions-Policy` header |
| L4 | Google Fonts external dependency — fingerprinting risk |
| L5 | Inline event handlers — blocks strict CSP (`'unsafe-inline'` required) |

### Recommended Remediation Order
1. Fix **C1**: Sanitize all `innerHTML` assignments (DOMPurify or text-only insertion)
2. Fix **M3**: Sanitize filenames before any DOM/canvas use
3. Fix **M1/C2**: Enforce CSP after removing inline handlers (L5)
4. Fix **H1**: Verify SRI hashes on CDN scripts are current
5. Fix **M4/H3**: Whitelist specific CORS origins on workers
6. Fix **H2/M5**: Add rate limiting to all Cloudflare Workers

---

## 15. Deployment & Hosting

**Site Hosting:** Static files served via CDN (CNAME → `playmatstudio.com`)
**Workers:** Deployed independently to Cloudflare Workers dashboard

### Required Environment Variables (Cloudflare Workers)
| Worker | Variable | Value |
|---|---|---|
| `contact-worker.js` | `RESEND_API_KEY` | Resend API key |
| `playmat-host-worker.js` | R2 binding | Bucket named `playmat-studio-hosting-files` |

### Cache Strategy
| Asset Type | Cache Duration | Mechanism |
|---|---|---|
| `index.html` | No cache | `no-store, must-revalidate` in `.htaccess` |
| CSS / JS | 1 year (immutable) | `max-age=31536000` + `?v=<timestamp>` query param |
| Images | 30 days | `max-age=2592000` |

### Version Bumping
The `v=` query param on CSS/JS is set to `Date.now()` at runtime — cache busting happens automatically on every page load. The displayed version number (`v1.7.1`) is a hardcoded `<div class="version-tag">` inside both tool editors. The changelog in `index.html` tracks public-facing versions (currently `v1.7.2b`).

To bump the display version: search for `v1.7.1` in `index.html` and update both occurrences.

---

## 16. Known Issues & Pending Work

### From Security Audit (High Priority)
- [ ] Sanitize `innerHTML` usage in `tool.js` (C1)
- [x] Implement Content Security Policy (C2) — CSP `<meta>` tag added in `index.html`; SSRF URL validation added to workers
- [ ] Verify Fabric.js + JSZip SRI hashes are current (H1)
- [ ] Add rate limiting to contact and R2 workers (H2, M5)
- [ ] Restrict CORS origins on R2 worker (M4)
- [x] Missing security response headers (M1) — `Permissions-Policy`, `HSTS`, `Referrer-Policy` added to `.htaccess`

### General
- [ ] Advanced Editor is labeled **Beta** — Fabric.js canvas has known edge cases with complex overlays
- [ ] `document.write()` used for CSS injection (L1) — consider replacing with standard `<link>` tags + versioned filenames
- [ ] Google Fonts loaded from external CDN — consider self-hosting for privacy/performance
- [ ] No offline/PWA support — full internet required for AI features and Google Fonts

### B2B Platform (Future Work)
The `b2b-handoff/` directory contains a complete project brief for a white-label storefront platform. This is a separate Next.js project, not part of the existing static site. See `b2b-handoff/CLAUDE.md` for the full context.

---

*This document was last updated on 2026-03-24 from codebase inspection. Update when significant architectural changes are made.*
