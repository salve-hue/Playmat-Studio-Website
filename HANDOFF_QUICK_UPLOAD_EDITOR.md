# Quick Upload Editor — Developer Handoff

**Version audited:** v1.7.1b
**Date:** March 2026
**Purpose:** Complete reference for rebuilding or integrating the Quick Upload (simple) editor into another codebase or Shopify deployment.

---

## Table of Contents

1. [What This Editor Does](#1-what-this-editor-does)
2. [File Locations](#2-file-locations)
3. [HTML Structure](#3-html-structure)
4. [Canvas Layer Stack](#4-canvas-layer-stack)
5. [Initialization Flow](#5-initialization-flow)
6. [State — APP Object Fields](#6-state--app-object-fields)
7. [Core Functions Reference](#7-core-functions-reference)
8. [Game Layout System](#8-game-layout-system)
9. [Filters](#9-filters)
10. [Export Pipeline](#10-export-pipeline)
11. [Share & Get Printed](#11-share--get-printed)
12. [URL Import (Paste URL)](#12-url-import-paste-url)
13. [Bleed & DPI Warnings](#13-bleed--dpi-warnings)
14. [All Event Listeners](#14-all-event-listeners)
15. [CSS Reference](#15-css-reference)
16. [Shared Dependencies](#16-shared-dependencies)
17. [Shopify Migration Notes](#17-shopify-migration-notes)
18. [Known Issues & Gotchas](#18-known-issues--gotchas)

---

## 1. What This Editor Does

The Quick Upload editor is a single-image workflow: upload artwork → optionally add a game layout overlay → download a print-ready 300 DPI JPEG. It is intentionally simpler than the Advanced Editor — no AI, no text tool, no gradient zones, no brush tools.

**User flow:**
1. Click "Quick Upload" tab → editor appears
2. Upload image file (or paste URL)
3. Zoom/rotate/fit artwork to fill canvas
4. (Optional) Select game + format + hand → overlay appears
5. (Optional) Toggle Enhance / Grayscale filters
6. Download → 300 DPI JPEG, or Share → hosted link, or Get Printed → print shop

**What it cannot do (see Advanced Editor for these):**
- AI upscaling or background removal
- Gradient zone overlays (solid color only)
- Text overlays
- Eraser / recolor brush
- Opacity control on the zone overlay

---

## 2. File Locations

| What | Where |
|------|-------|
| HTML (entire editor UI) | `index.html` lines ~471–561 |
| JS (all logic) | `assets/js/tool.js` lines ~375–860, plus shared functions throughout |
| CSS (editor layout) | `assets/css/tool.css` |
| Hidden file input | `index.html` — `<input type="file" id="simple-file-in">` near line 310 |
| Modals used | `#url-paste-modal`, `#dpi-warning-modal`, `#bleed-confirm-modal`, `#share-result-modal`, `#get-printed-modal`, `#app-alert-modal` |

---

## 3. HTML Structure

### Top-level container: `#simple-backdrop`

In tab mode (embedded), the backdrop is a normal block element. In standalone mode, it's a fixed full-screen overlay.

```
#simple-backdrop
└── #simple-modal
    ├── #simple-header          ← title + RESTART + FULL SCREEN buttons
    ├── #simple-canvas-wrap     ← canvas area (grows to fill)
    │   └── #simple-canvas-inner
    │       ├── canvas#s-main-canvas     ← Fabric.js (interactive)
    │       └── canvas#s-layout-canvas  ← game overlay (pointer-events: none)
    ├── #simple-info-bar        ← mat size / DPI / bleed legend
    └── #simple-tools           ← all controls
        ├── .simple-tool-grid (2-col CSS grid)
        │   ├── Left col: Artwork & Filters
        │   │   ├── button#s-upload-file-btn
        │   │   ├── button#s-paste-url-btn
        │   │   ├── input[range]#s-zoom-in      (0.1–2.5)
        │   │   ├── button#s-rotate-btn
        │   │   ├── button#s-fit-btn
        │   │   ├── button#s-btn-enhance
        │   │   ├── button#s-btn-grayscale
        │   │   └── button#s-guides-btn
        │   └── Right col: Game Layouts
        │       ├── select#s-game-sel
        │       ├── select#s-format-sel     (hidden until game chosen)
        │       ├── select#s-hand-sel       (hidden until format chosen)
        │       ├── div#s-rb-extras-wrap    (hidden unless Riftbound)
        │       │   └── select#s-rb-points-sel
        │       └── div#s-color-wrap        (hidden until layout chosen)
        │           └── input[color]#s-col
        ├── div#simple-bleed-warning        (hidden unless art doesn't cover canvas)
        └── .action-row-3
            ├── button#simple-print-btn     GET PRINTED (green)
            ├── button#simple-atc           DOWNLOAD (purple)
            └── button#simple-share-btn     SHARE (teal)
```

**Hidden file input** (outside the editor, triggers via button):
```html
<input type="file" id="simple-file-in" accept="image/*" style="display:none;">
```

### Full annotated HTML snippet
```html
<div id="simple-backdrop">
  <div id="simple-modal">
    <div id="simple-header">
      <span>Playmat Studio | Quick Upload</span>
      <button class="action-btn btn-secondary" id="s-restart-btn">RESTART</button>
      <button id="s-fs-toggle-btn" class="action-btn">⛶ FULL SCREEN</button>
    </div>

    <div id="simple-canvas-wrap">
      <div id="simple-canvas-inner">
        <canvas id="s-main-canvas"></canvas>
        <canvas id="s-layout-canvas"
          style="position:absolute; top:0; left:0; pointer-events:none; z-index:10;"></canvas>
      </div>
    </div>

    <div id="simple-info-bar" class="canvas-info-bar">
      <span id="si-size">Mat size: —</span>
      <span id="si-dpi">Image DPI: —</span>
      <span><span class="info-red">Red area:</span> Bleed — art must cover fully</span>
      <span><span class="info-yellow">Yellow area:</span> Safe Zone — keep essentials out</span>
    </div>

    <div id="simple-tools">
      <div class="simple-tool-grid"
           style="display:grid; grid-template-columns:1fr 1fr; gap:30px;">
        <!-- Left: Artwork & Filters -->
        <div>
          <label>Artwork & Filters</label>
          <button id="s-upload-file-btn" class="action-btn">📁 UPLOAD FILE</button>
          <button id="s-paste-url-btn"   class="action-btn btn-secondary">🔗 PASTE URL</button>
          <input  type="range" id="s-zoom-in" min="0.1" max="2.5" step="0.01" value="1">
          <button id="s-rotate-btn"      class="action-btn btn-secondary">↻ ROTATE</button>
          <button id="s-fit-btn"         class="action-btn btn-secondary">[ ] FIT</button>
          <button id="s-btn-enhance"     class="action-btn btn-secondary">🪄 ENHANCE</button>
          <button id="s-btn-grayscale"   class="action-btn btn-secondary">◑ GRAYSCALE</button>
          <button id="s-guides-btn"      class="action-btn btn-secondary">SHOW/HIDE PRINT GUIDES</button>
        </div>

        <!-- Right: Game Layouts -->
        <div>
          <label>Game Layouts (Optional)</label>
          <select id="s-game-sel"    class="ui-select">
            <option value="">-- Select Game (Optional) --</option>
          </select>
          <select id="s-format-sel"  class="ui-select hidden-field"></select>
          <select id="s-hand-sel"    class="ui-select hidden-field"></select>
          <div id="s-rb-extras-wrap" class="hidden-field">
            <label>Points Overlay</label>
            <select id="s-rb-points-sel" class="ui-select">
              <option value="none">None</option>
              <option value="basic">Basic Points</option>
              <option value="basic_1_14">Basic Points 1-14</option>
              <option value="project">Project</option>
              <option value="project_1_14">Project 1-14</option>
              <option value="lunar">Lunar</option>
              <option value="lunar_1_14">Lunar 1-14</option>
              <option value="khasino">Khasino</option>
            </select>
          </div>
          <div id="s-color-wrap" class="hidden-field">
            <label>Zone Color</label>
            <input type="color" id="s-col" value="#ffffff" class="color-swatch">
          </div>
        </div>
      </div>

      <div id="simple-bleed-warning" class="bleed-warning-banner">
        ⚠️ Artwork does not cover the full canvas. White borders will appear on your printed mat.
        Scale your artwork to fill the entire canvas including the red bleed area.
      </div>

      <div class="action-row-3">
        <button id="simple-print-btn" class="action-btn"
                style="background:var(--success-green);">📋 GET PRINTED</button>
        <button id="simple-atc"       class="action-btn">⬇️ DOWNLOAD</button>
        <button id="simple-share-btn" class="action-btn btn-secondary">🔗 SHARE</button>
      </div>

      <span class="disclaimer-text">
        All trademarks and copyrights are owned by their respective owners.
      </span>
    </div>
  </div>
  <div class="version-tag">v1.7.1</div>
</div>
```

---

## 4. Canvas Layer Stack

```
#simple-canvas-inner (position: relative)
│
├── canvas#s-main-canvas    z-index: auto  pointer-events: auto
│   Fabric.js canvas — holds the 'art' image object
│
└── canvas#s-layout-canvas  z-index: 10   pointer-events: none
    Plain 2D canvas — game zone overlay, drawn by renderSimpleLayout()
```

Both canvases are sized identically to `APP.canvasW × APP.canvasH` (CSS pixels). They scale with the container. The export pipeline renders both at print resolution (size_inches × 300 DPI).

---

## 5. Initialization Flow

### When editor opens (tab click or file drop)
```
selectMatSize(sizeKey)           ← set APP.activeSizeKey
  └── initSimpleCanvas()         ← create fabric.Canvas, or resize existing one
        ├── new fabric.Canvas('s-main-canvas', { backgroundColor: '#000', preserveObjectStacking: true })
        ├── attach canvas event handlers (object:modified → updateBleedWarnings, etc.)
        ├── calculate display dimensions from container
        │     maxW = #simple-canvas-wrap.clientWidth - 40
        │     aspect = conf.w / conf.h  (from SIZE_DB)
        │     also constrain by modalMaxH - headerH - toolsH - 40
        ├── sCanvas.setDimensions({ width, height })
        ├── set #simple-canvas-inner width/height
        └── drawSimpleGuides(w, h, conf.w)   ← red bleed + yellow safe zone
```

### When file is uploaded
```
handleSimpleUpload(input)
  ├── show #simple-backdrop (if not already tab-mode)
  ├── initSimpleCanvas()
  ├── FileReader.readAsDataURL
  └── fabric.Image.fromURL(dataUrl)
        ├── resetFilters()
        ├── checkDPI(img)          ← show warning if < 300 DPI
        ├── remove old 'art' object
        ├── add img, sendToBack
        ├── APP.s_baseArtScale = max(canvasW/srcW, canvasH/srcH)   ← cover-fit scale
        ├── img.scale(s_baseArtScale).set({ left: canvasW/2, top: canvasH/2 })
        ├── reset #s-zoom-in to 1
        └── updateBleedWarnings(sCanvas)
```

### Print guides
```javascript
// Called on init and on mat size change
window.drawSimpleGuides = function(w, h, inches) {
    // Remove old 'guides' group
    sCanvas.getObjects().filter(o => o.name === 'guides').forEach(o => sCanvas.remove(o));

    const ppi   = w / inches;
    const bleed = 0.25 * ppi;   // 0.25" at display scale
    const safe  = 0.75 * ppi;   // 0.75" at display scale

    // Red outer frame (bleed zone) — evenodd fill creates a hollow rectangle
    const bleedFrame = new fabric.Path(
        `M 0 0 H ${w} V ${h} H 0 Z M ${bleed} ${bleed} V ${h-bleed} H ${w-bleed} V ${bleed} Z`,
        { fill: 'rgba(255,0,0,0.25)', selectable: false, evented: false, fillRule: 'evenodd' }
    );

    // Yellow inner frame (safe zone)
    const safeFrame = new fabric.Path(
        `M ${bleed} ${bleed} H ${w-bleed} V ${h-bleed} H ${bleed} Z  M ${safe} ${safe} V ${h-safe} H ${w-safe} V ${safe} Z`,
        { fill: 'rgba(255,255,0,0.15)', selectable: false, evented: false, fillRule: 'evenodd' }
    );

    const g = new fabric.Group([bleedFrame, safeFrame], {
        name: 'guides', selectable: false, evented: false
    });
    sCanvas.add(g);
    g.bringToFront();
};
```

---

## 6. State — APP Object Fields

These are the fields in the global `APP` object (defined in `tool.js` lines 43–66) that the Quick Upload editor owns or reads:

| Field | Type | Purpose |
|-------|------|---------|
| `APP.s_activeLayoutUrl` | `string \| null` | URL of the currently loaded game layout, or `null` for none, or `''` for points-only |
| `APP.s_cachedLayoutImg` | `HTMLImageElement \| null` | Cached layout image (avoid re-fetching on re-render) |
| `APP.s_baseArtScale` | `number` | Scale at which the artwork fills the canvas (cover-fit). Zoom slider multiplies from this. |
| `APP.s_filters.enhance` | `boolean` | Whether the Enhance filter (brightness/contrast/sat boost) is active |
| `APP.s_filters.grayscale` | `boolean` | Whether the Grayscale filter is active |
| `APP.activeSizeKey` | `string` | Active mat size key, e.g. `'standard'`. Shared with Advanced Editor. |
| `APP.canvasW` | `number` | Canvas display width in CSS pixels (set by initSimpleCanvas). Shared with Adv. |
| `APP.canvasH` | `number` | Canvas display height in CSS pixels (set by initSimpleCanvas). Shared with Adv. |
| `APP.activePointsUrl` | `string \| null` | URL of active Riftbound points overlay. Shared with Adv. |
| `APP._bleedConfirmCallback` | `function \| null` | Callback stored when bleed warning is shown; executed if user clicks "proceed anyway" |

**`window.sCanvas`** — Fabric.js canvas instance (not on APP object, global).

---

## 7. Core Functions Reference

### Upload & Image Management

```javascript
window.handleSimpleUpload(input)
// Reads input.files[0], opens editor, loads image onto sCanvas as 'art' object.
// Sets APP.s_baseArtScale for cover-fit. Resets zoom slider to 1.

window.loadRemoteArt(url)
// Shared with Advanced Editor. Detects which editor is active.
// For simple mode: tries wsrv.nl proxy first, then corsproxy.io fallback.
// On success: loads image the same way as handleSimpleUpload.
```

### Zoom & Transform

```javascript
window.handleSimpleZoom(v)
// v: string from range slider (0.1–2.5)
// Sets art scale to APP.s_baseArtScale * v
// Calls updateBleedWarnings() after

window.forceSimpleFit()
// Recalculates s_baseArtScale from natural image dimensions
// Centers art, resets zoom slider to 1, clears rotation

window.rotateSimpleArt()
// Rotates 'art' object 90° clockwise on sCanvas
// Calls renderAll() + updateBleedWarnings()
```

### Filters

```javascript
window.toggleSimpleFilter(type)
// type: 'enhance' | 'grayscale'
// Toggles APP.s_filters[type], updates button appearance, calls applySimpleFiltersCore()

window.applySimpleFiltersCore()
// Builds a CSS filter string from APP.s_filters state and sets it on art.customFilterStr
// Enhance: 'brightness(112%) contrast(108%) saturate(115%)'
// Grayscale: 'grayscale(100%)'
// Both can be combined
// Calls sCanvas.renderAll()
```

**Note:** Filters are applied via the `customFilterStr` custom property on the Fabric Image object. The Fabric canvas has a patched `_render` function that applies `ctx.filter = obj.customFilterStr` before drawing. Check that this patch exists in the `tool.js` initialization block.

### Print Guides

```javascript
window.drawSimpleGuides(w, h, inches)
// Draws bleed (red, 0.25") and safe zone (yellow, 0.75") guides as Fabric Group named 'guides'
// Call after canvas dimensions change

window.toggleSimpleGuides()
// Toggles visibility of the 'guides' Fabric Group
```

### Layout

```javascript
window.filterSimpleFormats()    // Triggered by s-game-sel change; populates format dropdown
window.filterSimpleHands()      // Triggered by s-format-sel change; populates hand dropdown
window.applySimpleLayout()      // Triggered by s-hand-sel change; sets APP.s_activeLayoutUrl
window.renderSimpleLayout()     // Draws layout on #s-layout-canvas; reads APP.s_activeLayoutUrl
window.changeRbPoints()         // Triggered by s-rb-points-sel; updates APP.activePointsUrl
```

### Canvas Lifecycle

```javascript
window.initSimpleCanvas()
// Creates sCanvas if it doesn't exist, or resizes it. Always recalculates dimensions.
// Call whenever: editor opens, mat size changes, window resizes

window.toggleSimpleFullScreen()
// Adds/removes simple-fullscreen-mode class on #simple-modal
// Triggers initSimpleCanvas() to recalculate dimensions

window.restartApp()
// Clears both sCanvas and canvas (advanced), resets APP state,
// hides backdrops, shows landing UI
```

---

## 8. Game Layout System

### Database

`LAYOUT_RAW` array (tool.js lines ~110–158) — 48+ entries:

```javascript
{
  game:   "Magic: the Gathering",   // Populates s-game-sel
  format: "60-card",                // Populates s-format-sel
  size:   "Standard",               // Filters to APP.activeSizeKey
  hand:   "Left",                   // Populates s-hand-sel
  url:    "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/..."
}
```

Size key → display size mapping: `'standard' → 'Standard'`, `'extended' → 'Extended'`. Other sizes are exact string matches.

### Dropdown cascade

```
s-game-sel.change
  └── filterSimpleFormats()
        ├── populates s-format-sel with unique formats for game+size
        ├── if no formats → hides s-format-sel, calls filterSimpleHands() directly
        └── shows/hides s-rb-extras-wrap (Riftbound only)

s-format-sel.change
  └── filterSimpleHands()
        ├── populates s-hand-sel with unique hands for game+format+size
        └── if no hands → calls applySimpleLayout() directly

s-hand-sel.change
  └── applySimpleLayout()
        ├── finds matching LAYOUT_RAW entry
        ├── sets APP.s_activeLayoutUrl = match.url (or '' for points-only)
        ├── shows s-color-wrap
        └── calls renderSimpleLayout()
```

### Layout rendering

`renderSimpleLayout()` draws on `#s-layout-canvas` using `drawLayoutCanvasCore()`:

- **Solid color** (always in simple editor): fills zone area with `#s-col` value
- **Riftbound**: clips to safe area, draws background layout, applies solid fill via `source-in` compositing
- **Other games**: draws image scaled to full canvas, applies solid fill via `source-in`
- **Points-only** (`APP.s_activeLayoutUrl === ''`): passes null as layout image, draws only points overlay

On CORS failure, falls back to loading without `crossOrigin: 'anonymous'`.

### Riftbound points overlay

```javascript
window.RB_POINTS_DB = {
  none:          undefined,
  basic:         "https://pub-.../rb-points-basic.png",
  basic_1_14:    "https://pub-.../rb-points-basic-1-14.png",
  project:       "...",
  project_1_14:  "...",
  lunar:         "...",
  lunar_1_14:    "...",
  khasino:       "..."
}
```

`changeRbPoints()` loads the selected points image into `window.rbPointsImg` and calls `renderSimpleLayout()`.

---

## 9. Filters

The simple editor has only two binary filter toggles:

| Filter | CSS filter string | Button ID |
|--------|-------------------|-----------|
| Enhance | `brightness(112%) contrast(108%) saturate(115%)` | `#s-btn-enhance` |
| Grayscale | `grayscale(100%)` | `#s-btn-grayscale` |

Filters can be combined. They are applied at render time and export time via `ctx.filter` on the 2D context, not via Fabric.js's native filter pipeline (which would require re-encoding the image). This means the original image data is preserved; filters are display-only until export.

**Important:** The export pipeline (`buildPrintCanvas`) reads `art.customFilterStr` and applies it to the 2D context when drawing the artwork at print resolution. If you refactor filters, ensure `art.customFilterStr` is still set correctly.

---

## 10. Export Pipeline

### Entry point

```javascript
window.downloadDesign('simple')   // or 'adv' for Advanced Editor
```

### Flow

```
downloadDesign('simple')
  ├── check: sCanvas has 'art' object or background color → error if not
  ├── checkArtCoverage(sCanvas)
  │     └── if art doesn't fill canvas → show #bleed-confirm-modal
  │           └── user clicks "proceed" → APP._bleedConfirmCallback() → _executeDownload()
  └── _executeDownload('simple', btn, sCanvas)
        ├── btn text → 'PREPARING...'
        ├── blob = await buildPrintCanvas(false, sCanvas)
        ├── filename = buildPrintFilename()   → e.g. "playmat-standard-1710800000000.jpg"
        ├── trigger browser download
        └── btn text → 'DOWNLOADED! ✓' for 2.5s
```

### buildPrintCanvas (shared with Advanced Editor)

```javascript
// Parameters: isAdv=false (simple), activeCanvas=sCanvas
const printW = Math.round(SIZE_DB[APP.activeSizeKey].w * 300)  // e.g. 7350px
const printH = Math.round(SIZE_DB[APP.activeSizeKey].h * 300)  // e.g. 4350px
const scale  = printW / APP.canvasW                            // CSS→print ratio
```

**Layer compositing order:**
1. Background color fill (if `sCanvas.backgroundColor` set)
2. Artwork image — drawn directly via `ctx.drawImage` at print scale, with transforms (translate, rotate, flipX/Y, filter)
3. Layout overlay — drawn at print scale via temp canvas, color-filled via `source-in` compositing
4. *(Advanced only: text objects, AI foreground, recolor strokes)*

**Output:** JPEG blob at 98% quality. Passed through `injectJpegDpi(blob, 300)` to embed 300 DPI JFIF metadata.

### Print dimensions by mat size

| Key | Print size (px) |
|-----|----------------|
| `standard` | 7350 × 4350 |
| `expanded` | 8550 × 4950 |
| `extended` | 8550 × 4350 |
| `victor` | 7200 × 3600 |
| `secundus` | 8400 × 3600 |
| `primus` | 9300 × 3600 |
| `tiro` | 3000 × 2400 |
| `veteranus` | 3750 × 3150 |
| `gladiator` | 5400 × 3600 |

---

## 11. Share & Get Printed

Both flows are identical except for which modal they open.

```javascript
window.shareDesign('simple')
// 1. Build print canvas (same as download)
// 2. POST FormData to window.CLOUDFLARE_HOST_URL (files.playmatstudio.com)
//    Field: 'file' = blob, filename = buildPrintFilename()
// 3. Response: { ok: true, url: "...", expires: "ISO date" }
// 4. Show #share-result-modal with url + days-until-expiry

window.openGetPrinted('simple')
// Same steps 1–3 as above
// 4. Show #get-printed-modal with url + days-until-expiry
```

**Worker upload endpoint:** `window.CLOUDFLARE_HOST_URL` = `'https://files.playmatstudio.com/'`

File is stored in Cloudflare R2, expires in 7 days. The URL is a direct R2 serve URL.

**For Shopify:** Replace the R2 upload with Shopify's file storage, or keep R2 but authenticate the upload via Shopify customer session. Replace `#get-printed-modal` with Shopify Add-to-Cart.

---

## 12. URL Import (Paste URL)

Modal `#url-paste-modal` is shared between both editors. Which editor receives the image is detected at load time.

```javascript
window.promptPasteUrl()       // Opens modal, clears input
window.submitUrlPaste()       // Validates URL format, calls loadRemoteArt(url)

window.loadRemoteArt(url)
// Detects active editor by checking #adv-backdrop visibility
// For simple: initialises sCanvas if needed
// Tries CORS proxies in order:
//   1. https://wsrv.nl/?url=<encoded>&output=webp
//   2. https://corsproxy.io/?<encoded>
// On success: loads image same as handleSimpleUpload
```

**URL validation:**
Must start with `http` and match `/\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i`. This check is clientside-only; the proxy can still serve anything.

---

## 13. Bleed & DPI Warnings

### Bleed coverage check

```javascript
window.checkArtCoverage(ac)
// Returns true if 'art' object's bounding rect covers the full canvas (within 1px tolerance)
// Uses getBoundingRect(true, true) — absolute coords including transforms

window.updateBleedWarnings(ac)
// Determines if ac is sCanvas or canvas (advanced)
// Shows/hides #simple-bleed-warning (or #adv-bleed-warning)
// Also applies .coverage-warn class to info bar for red tint
```

`updateBleedWarnings` is called on every `object:modified` and `object:added` canvas event.

### DPI warning

```javascript
window.checkDPI(img)
// img: Fabric Image object
// effectiveDpi = min(img.width / conf.w, img.height / conf.h)
// If < 300: shows #dpi-warning-modal with calculated DPI in message
// Always calls updateInfoBars(img)
```

`#dpi-warning-modal` has two buttons:
- `#dpi-understand-btn` → hides modal, proceeds
- `#dpi-help-btn` → opens help modal

---

## 14. All Event Listeners

All listeners are registered in tool.js using an `on(id, event, handler)` helper (wraps `addEventListener` with null-check).

```javascript
// File upload
on('s-upload-file-btn', 'click',  () => document.getElementById('simple-file-in').click())
on('simple-file-in',    'change', function() { window.handleSimpleUpload(this) })

// Canvas controls
on('s-paste-url-btn',   'click',  () => window.promptPasteUrl())
on('s-zoom-in',         'input',  function() { window.handleSimpleZoom(this.value) })
on('s-rotate-btn',      'click',  () => window.rotateSimpleArt())
on('s-fit-btn',         'click',  () => window.forceSimpleFit())
on('s-guides-btn',      'click',  () => window.toggleSimpleGuides())

// Filters
on('s-btn-enhance',     'click',  () => window.toggleSimpleFilter('enhance'))
on('s-btn-grayscale',   'click',  () => window.toggleSimpleFilter('grayscale'))

// Game layout cascade
on('s-game-sel',        'change', () => window.filterSimpleFormats())
on('s-format-sel',      'change', () => window.filterSimpleHands())
on('s-hand-sel',        'change', () => window.applySimpleLayout())
on('s-rb-points-sel',   'change', () => window.changeRbPoints())
on('s-col',             'input',  () => window.renderSimpleLayout())

// Export
on('simple-print-btn',  'click',  () => window.openGetPrinted('simple'))
on('simple-atc',        'click',  () => window.downloadDesign('simple'))
on('simple-share-btn',  'click',  () => window.shareDesign('simple'))

// Header
on('s-restart-btn',     'click',  () => window.restartApp())
on('s-fs-toggle-btn',   'click',  () => window.toggleSimpleFullScreen())

// Shared modals
on('dpi-understand-btn',  'click', () => hide('dpi-warning-modal'))
on('url-paste-close-x',   'click', () => hide('url-paste-modal'))
on('url-paste-submit',    'click', () => window.submitUrlPaste())
on('bleed-back-btn',      'click', () => window._closeBleedConfirm())
on('bleed-proceed-btn',   'click', () => window._proceedDespiteBleed())
```

---

## 15. CSS Reference

All in `assets/css/tool.css`.

### Key selectors

```css
/* Backdrop (modal overlay in standalone, block in tab mode) */
#simple-backdrop { display: none; position: fixed; ... z-index: 999999; }
#simple-backdrop.tab-mode { position: static; display: block; ... }

/* Modal window */
#simple-modal { background: var(--brand-bg); max-width: 900px; ... }

/* Canvas container */
#simple-canvas-wrap { flex-grow: 1; background: #0b0912; overflow: auto; }
#simple-canvas-inner { position: relative; }  /* Stacking context for overlay canvas */

/* Info bar */
.canvas-info-bar { font-size: 12px; color: var(--brand-text-sec); ... }
.canvas-info-bar.coverage-warn { background: rgba(255,71,87,0.25); }  /* Red tint */

/* Bleed warning */
.bleed-warning-banner { display: none; background: rgba(255,71,87,0.15); color: #ff4757; }
.bleed-warning-banner.visible { display: block; }

/* Full-screen mode */
#simple-modal.simple-fullscreen-mode { position: fixed; top: 2%; width: 96vw; height: 96vh; }

/* Utility */
.hidden-field { display: none !important; }
.color-swatch { width: 50px; height: 36px; cursor: pointer; border-radius: 4px; }
```

### CSS custom properties used

```css
--brand-primary:    #6830BB    /* Default button background */
--brand-hover:      #30BBAD    /* Button hover, active filter buttons */
--brand-bg:         #181228    /* Editor background */
--brand-text-pri:   #f0eeff
--brand-text-sec:   #9888c0
--success-green:    #83BB30    /* GET PRINTED button */
--danger-red:       #BB303E
--adv-nav-offset:   64px       /* Fixed header height; used for backdrop padding-top */
```

---

## 16. Shared Dependencies

These are shared between the Quick Upload editor and the Advanced Editor. They must exist in any codebase that uses either editor.

| Dependency | What it does |
|-----------|-------------|
| `Fabric.js 5.3.1` | Canvas rendering (CDN, SRI hash required) |
| `JSZip 3.10.1` | ZIP creation for batch download (CDN) |
| `SIZE_DB` | Mat size database (9 products, dimensions in inches) |
| `LAYOUT_RAW` | Game overlay database (48+ entries) |
| `window.RB_POINTS_DB` | Riftbound points overlay URLs (8 variants) |
| `buildPrintCanvas(isAdv, canvas)` | Shared print pipeline; `isAdv=false` for simple |
| `injectJpegDpi(blob, dpi)` | Embeds DPI metadata in JPEG blob |
| `drawLayoutCanvasCore(...)` | Core overlay compositing logic |
| `applyGradientOrSolidFill(...)` | Color fill helper used by layout rendering |
| `drawRiftboundLayout(...)` | Riftbound-specific layout compositing |
| `checkArtCoverage(canvas)` | Returns bool — does art cover the canvas? |
| `updateBleedWarnings(canvas)` | Shows/hides bleed warning banner |
| `checkDPI(img)` | Shows DPI warning if image < 300 DPI |
| `updateInfoBars(img)` | Updates `#si-size` and `#si-dpi` spans |
| `showAppAlert(title, msg, type)` | Generic error/info modal |
| `uploadImageToStaging(blob, name, dpi)` | Uploads to R2, returns URL (used by share/print flows) |
| `buildPrintFilename()` | Generates `playmat-<size>-<timestamp>.jpg` |
| `window.CLOUDFLARE_HOST_URL` | R2 upload/serve endpoint |
| `window.CLOUDFLARE_WORKER_URL` | AI upscaler worker (not used by simple editor) |
| `window.CLOUDFLARE_BG_WORKER_URL` | AI BG removal worker (not used by simple editor) |

---

## 17. Shopify Migration Notes

### Embedding the editor

The editor is designed to work in two modes, controlled by a CSS class:
- **Tab mode** (`.tab-mode` on `#simple-backdrop`): renders inline in the page, no overlay. This is the mode to use in Shopify.
- **Backdrop mode** (default): full-screen overlay, controlled by `display: flex`.

For Shopify, apply `#simple-backdrop.tab-mode` and render it inside a Shopify section or app block. Remove the fixed-position styles from `#simple-backdrop`.

### Get Printed → Shopify Cart

Replace `window.openGetPrinted('simple')` with a flow that:
1. Builds the print canvas (same)
2. Uploads to R2 (or Shopify Files)
3. Calls Shopify's `/cart/add.js` with the product variant + `properties: { _design_url: uploadedUrl }`
4. Redirects to `/cart` or opens cart drawer

The `#get-printed-modal` becomes a cart confirmation, not a URL display.

### Mat sizes → Shopify variants

Replace `SIZE_DB` population with a fetch to Shopify's Storefront API:

```javascript
// Current (hardcoded)
const conf = SIZE_DB[APP.activeSizeKey];   // { w: 24.5, h: 14.5, label: '24" x 14"' }

// Shopify (dynamic)
const variants = await fetch('/products/<handle>.js').then(r => r.json()).then(p => p.variants);
// Map variant.title → { w, h } using a known naming convention
```

The mat size buttons in the landing UI (`selectMatSize()`) would need to be generated from variant data.

### Upload endpoint

`window.CLOUDFLARE_HOST_URL` is the R2 worker URL. Add authentication before allowing uploads:

```javascript
// In playmat-host-worker.js, validate a Shopify customer token:
const customerId = request.headers.get('X-Shopify-Customer-Id');
if (!customerId) return new Response('Unauthorized', { status: 401 });
```

Pass the token from the Shopify Storefront API's Customer Access Token.

### CSP updates

The existing `.htaccess` CSP `connect-src` must be extended with your Shopify store domain:
```
connect-src ... https://<your-store>.myshopify.com https://<your-store>.com
```

### sessionStorage — upload history

The Image Hosting tab (not this editor) uses `sessionStorage` key `ps_hosted_images`. This is cleared on tab close, which is fine for Shopify. No migration needed unless you want persistence across sessions (use Shopify customer metafields if so).

---

## 18. Known Issues & Gotchas

1. **Canvas dimensions are CSS pixels, not print pixels.** `APP.canvasW/H` is the display size. Print size is `SIZE_DB[key].w * 300`. Don't confuse the two in any resize or export logic.

2. **`s_baseArtScale` is recalculated on every fit/upload.** If you modify canvas dimensions (e.g. window resize), call `initSimpleCanvas()` again. It will resize the canvas but will not refit the image — you also need to call `forceSimpleFit()` or the image will be mispositioned.

3. **Layout overlay is a separate canvas, not a Fabric object.** This means it doesn't move with the artwork. The overlay is always full-canvas and the user adjusts the artwork position underneath it. Do not try to add the layout as a Fabric image on `sCanvas`.

4. **`buildPrintCanvas` draws artwork with direct `ctx.drawImage`**, bypassing Fabric's render pipeline. This was done to work around a Fabric bug where `setZoom` crops the canvas during export. The artwork's transform properties (left, top, angle, scale, flipX, flipY) must remain as Fabric object properties; do not store them elsewhere.

5. **Filter persistence across mat size changes.** When `changeSize()` is called, the canvas is resized but the Fabric objects are not re-added. The art's `customFilterStr` persists on the Fabric object; no action needed. However, `s_baseArtScale` may need recalculation — the current code does not do this automatically on resize.

6. **Game layout filtering ignores sizes other than Standard/Extended.** `filterSimpleFormats()` maps `activeSizeKey` to a display size string, but only handles `'standard'` and `'extended'`. Other size keys fall through to the raw value, which may not match any `LAYOUT_RAW` entries. Check carefully if supporting all 9 mat sizes with overlays.

7. **Proxy watermarks.** wsrv.nl may add its own branding on some content types. The fallback corsproxy.io has rate limits. Both are third-party services; consider a self-hosted CORS proxy for production Shopify deployment.

8. **No undo in Quick Editor.** There is no undo stack for the simple editor (unlike the Advanced Editor's eraser undo). Any destructive action (rotate, fit) is permanent until restart. This is by design but worth noting if combining with another tool.
