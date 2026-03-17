# Advanced Editor — Developer Handoff

**Version audited:** v1.7.1b
**Date:** March 2026
**Purpose:** Complete reference for rebuilding or integrating the Advanced Editor into another codebase or Shopify deployment.

---

## Table of Contents

1. [What This Editor Does](#1-what-this-editor-does)
2. [File Locations](#2-file-locations)
3. [HTML Structure](#3-html-structure)
4. [Canvas Layer Stack](#4-canvas-layer-stack)
5. [Initialization Flow](#5-initialization-flow)
6. [State — APP Object Fields](#6-state--app-object-fields)
7. [Core Functions Reference](#7-core-functions-reference)
8. [Sidebar Accordion Panels](#8-sidebar-accordion-panels)
9. [Game Layout System](#9-game-layout-system)
10. [Zone Color & Gradient System](#10-zone-color--gradient-system)
11. [Print Color Correction](#11-print-color-correction)
12. [Text Tool](#12-text-tool)
13. [Transform Controls](#13-transform-controls)
14. [Eraser Brush](#14-eraser-brush)
15. [Recolor Brush](#15-recolor-brush)
16. [AI Features](#16-ai-features)
17. [Export Pipeline](#17-export-pipeline)
18. [Share & Get Printed](#18-share--get-printed)
19. [Zoom & Pan](#19-zoom--pan)
20. [All Event Listeners](#20-all-event-listeners)
21. [CSS Reference](#21-css-reference)
22. [Shared Dependencies](#22-shared-dependencies)
23. [Shopify Migration Notes](#23-shopify-migration-notes)
24. [Known Issues & Gotchas](#24-known-issues--gotchas)

---

## 1. What This Editor Does

The Advanced Editor is a full-featured, layer-based image editor running in-browser. It is more capable than the Quick Upload editor and is marked **Beta**.

**Additional features over Quick Upload:**
- Gradient zone overlays (not just solid color)
- Zone opacity control
- AI-powered image upscaling (via Replicate API)
- AI background removal / "frame breaking" (via Replicate API)
- Manual eraser brush (erase the zone overlay to let artwork show through)
- Recolor brush (paint new colors over the zone layer)
- Text overlays with font/size/color/outline controls
- Artwork rotate/flip/angle transforms
- Print color correction (brightness, contrast, saturation sliders + auto-optimize)
- Workspace zoom (scale the whole editor, not just the artwork)
- All game overlays with gradient support and opacity

**User flow:**
1. Click "Advanced Editor" tab → editor appears
2. Upload image (or paste URL, or set solid color background)
3. (Optional) Apply color correction, scale/rotate artwork
4. (Optional) Select game layout → configure zone color/gradient/opacity
5. (Optional) Use eraser or recolor brush to customize zone appearance
6. (Optional) Use "Auto Frame Break" to pop character out in front of zone
7. (Optional) Add text overlays
8. Download 300 DPI JPEG, or Share link, or Get Printed

---

## 2. File Locations

| What | Where |
|------|-------|
| HTML (entire editor UI) | `index.html` lines ~564–900 |
| JS (all logic) | `assets/js/tool.js` (2472 lines) |
| CSS (editor layout) | `assets/css/tool.css` |
| Hidden file input | `index.html` — `<input type="file" id="adv-file-in">` inside `#acc-size` |
| Modals used | `#ai-upscale-modal`, `#ai-warning-modal`, `#ai-success-modal`, `#dpi-warning-modal`, `#url-paste-modal`, `#bleed-confirm-modal`, `#share-result-modal`, `#get-printed-modal`, `#app-alert-modal`, `#help-modal` |

---

## 3. HTML Structure

### Top-level: `#adv-backdrop`

In tab mode, the backdrop is a block element wrapping `#playmat-tool-root` (the actual editor). In standalone mode, it's a full-screen overlay.

```
#adv-backdrop
└── #playmat-tool-root           ← display: flex; flex-direction: row
    ├── #sidebar                 ← 300px wide, scrollable
    │   ├── .studio-title-wrap   ← "Playmat Studio" heading + "Advanced Editor BETA"
    │   ├── .sidebar-header      ← RESTART + FULL SCREEN buttons
    │   │
    │   ├── button.acc-btn [data-acc="acc-size"]       ← ARTWORK accordion
    │   └── div#acc-size.acc-content
    │       ├── button#adv-upload-file-btn
    │       ├── button#adv-paste-url-btn
    │       ├── input[file]#adv-file-in
    │       ├── button#ai-upscale-btn-adv              ← AI upscale
    │       └── div: bg-color-picker + bg-color-hex    ← solid color fallback
    │
    │   ├── button.acc-btn [data-acc="acc-layouts"]    ← GAME LAYOUT accordion
    │   └── div#acc-layouts.acc-content
    │       ├── select#game-sel
    │       ├── select#format-sel (hidden)
    │       ├── select#hand-sel (hidden)
    │       ├── div#rb-extras-wrap (hidden unless Riftbound)
    │       │   └── select#rb-points-sel
    │       └── div#zone-style-wrap (hidden until layout selected)
    │           ├── select#mode-sel             Solid / Gradient
    │           ├── input[color]#col-1 + input[text]#col-1-hex
    │           ├── div#grad-controls (hidden unless mode=gradient)
    │           │   ├── input[color]#col-2 + input[text]#col-2-hex
    │           │   ├── input[checkbox]#col-2-trans
    │           │   ├── input[range]#angle-in (0–360)
    │           │   └── div#angle-compass
    │           ├── input[range]#op-in (0.1–1.0)
    │           ├── div.inner-panel: FRAME BREAKING
    │           │   ├── button#ai-fb-btn         Auto Frame Break
    │           │   └── button#ai-fb-clear-btn   Remove AI Pop-Out (hidden initially)
    │           ├── div.inner-panel: MANUAL ERASER
    │           │   ├── button#mask-toggle-btn
    │           │   └── div#mask-controls (hidden)
    │           │       ├── input[range]#brush-size (10–150)
    │           │       ├── button#mask-undo-btn
    │           │       └── button#mask-reset-btn
    │           └── div.inner-panel: RECOLOR BRUSH
    │               ├── button#recolor-toggle-btn
    │               └── div#recolor-controls (hidden)
    │                   ├── input[range]#recolor-size (5–100)
    │                   ├── input[color]#recolor-color
    │                   ├── button#recolor-undo-btn
    │                   └── button#recolor-reset-btn
    │
    │   ├── button.acc-btn [data-acc="acc-art"]        ← ADJUSTMENTS accordion
    │   └── div#acc-art.acc-content
    │       ├── div.inner-panel: PRINT COLOR CORRECTION
    │       │   ├── button#auto-opt-btn-adv
    │       │   ├── input[range]#filter-brightness (-0.3–0.3)
    │       │   ├── input[range]#filter-contrast   (-0.3–0.3)
    │       │   ├── input[range]#filter-saturation (-0.5–0.5)
    │       │   ├── button#adv-reset-colors-btn
    │       │   └── button#adv-guides-btn
    │       ├── input[range]#zoom-in (0.1–2.5)
    │       ├── button#adv-reset-scale-btn
    │       └── div.inner-panel: TEXT & TRANSFORMATIONS
    │           ├── button#adv-add-text-btn
    │           ├── div#adv-text-tools (hidden until text selected)
    │           │   ├── select#adv-font-family
    │           │   ├── input[range]#adv-text-size-in (10–200)
    │           │   ├── input[color]#adv-text-col
    │           │   ├── input[color]#adv-text-stroke
    │           │   └── button#adv-delete-btn
    │           ├── button#adv-rotate-btn / #adv-flipx-btn / #adv-flipy-btn
    │           ├── input[range]#transform-rotation (-180–180)
    │           └── button#adv-reset-rotation-btn
    │
    │   └── div.action-row-3
    │       ├── div#adv-bleed-warning (hidden)
    │       ├── button#sidebar-print-btn   GET PRINTED (green)
    │       ├── button#sidebar-atc         DOWNLOAD (purple)
    │       └── button#sidebar-share-btn  SHARE (teal)
    │
    └── #canvas-column             ← flex-grow: 1, background: #0b0912
        ├── div#zoom-toolbar       ← + / - / RESET buttons (top-right)
        ├── div#canvas-wrapper     ← transform-origin: center; scale via workspaceZoom
        │   ├── canvas#main-canvas           Fabric.js (artwork + text)
        │   ├── canvas#layout-canvas         game zone overlay (z-index: 10)
        │   ├── canvas#fg-canvas             AI foreground / frame-break (z-index: 20)
        │   ├── div#recolor-container        masked by layout-canvas (z-index: 30)
        │   │   └── canvas#recolor-canvas    Fabric.js drawing canvas
        │   └── div#eraser-interaction       invisible mouse capture (z-index: 40)
        └── div#adv-info-bar.canvas-info-bar
```

---

## 4. Canvas Layer Stack

```
#canvas-wrapper (CSS transform for workspace zoom)
│
├── canvas#main-canvas       z-index: 0    pointer-events: auto
│   Fabric.js instance (window.canvas)
│   Contains: 'art' image, 'guides' group, text IText objects
│
├── canvas#layout-canvas     z-index: 10   pointer-events: none
│   Plain 2D canvas — game zone overlay
│   Also the MASK SOURCE for recolor-container (CSS mask-image)
│   Eraser strokes are drawn here via destination-out compositing
│
├── canvas#fg-canvas         z-index: 20   pointer-events: none
│   Plain 2D canvas — AI background removal result
│   APP.aiFgImg is drawn here matching artwork transforms
│
├── div#recolor-container    z-index: 30   (pointer-events toggled by mode)
│   CSS mask: mask-image: url(layout-canvas.toDataURL())
│   Limits recolor strokes to appear only within zone areas
│   └── canvas#recolor-canvas  Fabric.js instance (window.rCanvas)
│       Fabric PencilBrush draws here; freeDrawingMode
│
└── div#eraser-interaction   z-index: 40   (pointer-events toggled by mode)
    Invisible div capturing mouse/touch for eraser
    Routes events to layout-canvas via destination-out compositing
```

---

## 5. Initialization Flow

### When editor opens (tab click or file upload)

```
selectMatSize(sizeKey)
  └── initCanvas()
        ├── if (!window.canvas):
        │   ├── window.canvas  = new fabric.Canvas('main-canvas', { backgroundColor:'#000', preserveObjectStacking:true })
        │   ├── window.rCanvas = new fabric.Canvas('recolor-canvas', { backgroundColor: null })
        │   ├── canvas events: selection:created/updated/cleared → handleSelection/syncTransformUI
        │   │                  object:modified/added → updateBleedWarnings
        │   └── initEraserInteraction()   ← attach mouse/touch to #eraser-interaction
        └── changeSize()                  ← always runs, even on re-open
              ├── conf = SIZE_DB[APP.activeSizeKey]
              ├── measuredW = #canvas-column.clientWidth - padding (80px desktop, 20px mobile)
              ├── APP.canvasW = measuredW
              ├── APP.canvasH = canvasW / (conf.w / conf.h)
              ├── canvas.setDimensions({ width, height })
              ├── rCanvas.setDimensions({ width, height })
              ├── #canvas-wrapper style width/height
              ├── drawAdvGuides(w, h, conf.w)
              ├── forceFit()              ← scale/center existing art if present
              ├── renderLayout()          ← redraw zone overlay
              └── renderForeground()      ← redraw AI foreground
```

### Fabric global settings (set at top of tool.js)

```javascript
fabric.Object.prototype.objectCaching = false;   // Disable tile cache (performance)
fabric.textureSize = 16384;                       // Allow large textures
```

### Print guides

```javascript
window.drawAdvGuides(w, h, inches)
// Same logic as drawSimpleGuides but on window.canvas
// Bleed: 0.25" = ppi * 0.25
// Safe:  0.75" = ppi * 0.75
// Uses Fabric Path with evenodd fillRule for hollow rectangles
```

---

## 6. State — APP Object Fields

These are all fields in the global `APP` object (tool.js lines 43–66) used by the Advanced Editor:

| Field | Type | Purpose |
|-------|------|---------|
| `APP.isMaskMode` | `boolean` | Is the eraser brush currently active? |
| `APP.isRecolorMode` | `boolean` | Is the recolor brush currently active? |
| `APP.currentZoom` | `number` | Workspace zoom level (0.5–3); applied as CSS scale to `#canvas-wrapper` |
| `APP.currentBrushShape` | `'round' \| 'square'` | Shape for both eraser and recolor brush strokes |
| `APP.canvasW` | `number` | Canvas display width in CSS pixels |
| `APP.canvasH` | `number` | Canvas display height in CSS pixels |
| `APP.baseArtScale` | `number` | Scale at which art fills canvas (cover-fit). Zoom slider multiplies from this. |
| `APP.activeLayoutUrl` | `string \| null` | URL of active game layout, or `null`, or `''` (points-only) |
| `APP.cachedLayoutUrl` | `string \| null` | Cache key to avoid re-loading same image |
| `APP.cachedLayoutImg` | `HTMLImageElement \| null` | Cached layout image element |
| `APP.aiFgImg` | `HTMLImageElement \| null` | AI background-removed foreground image |
| `APP.activeUpscaleEditor` | `'adv' \| 'simple' \| null` | Which editor triggered the AI upscale |
| `APP.erasedPaths` | `ErasurePath[]` | Array of eraser stroke data for undo. Each path: `{ size, shape, points: [{x,y}...] }` |
| `APP.activeSizeKey` | `string` | Active mat size key (shared with Quick Upload) |
| `APP.activePointsUrl` | `string \| null` | Riftbound points overlay URL (shared) |
| `APP._bleedConfirmCallback` | `function \| null` | Callback executed if user proceeds past bleed warning |

**Canvas instances (globals, not on APP):**
- `window.canvas` — main Fabric.js canvas
- `window.rCanvas` — recolor Fabric.js canvas

---

## 7. Core Functions Reference

### Canvas & Upload

```javascript
window.initCanvas()
// Creates/resizes Fabric canvases. Safe to call repeatedly.

window.handleUpload(input)
// Loads input.files[0] onto window.canvas as 'art' object
// Sets APP.baseArtScale (cover-fit), centers art, resets zoom/rotation sliders
// Calls: clearAutoFrameBreak(), checkDPI(img), updateBleedWarnings()

window.forceFit()
// Recalculates baseArtScale, centers art, resets zoom slider + rotation

window.setSolidBackground(color)
// Sets canvas.backgroundColor to hex color, calls renderAll()
// Clears art object if present

window.changeSize()
// Recalculates all canvas dimensions from SIZE_DB[APP.activeSizeKey]
// Called on: init, mat size change, window resize, fullscreen toggle

window.restartApp()
// Clears both canvas and sCanvas, resets APP state, hides backdrops
```

### Zoom

```javascript
window.handleZoom(v)
// Scales 'art' to APP.baseArtScale * v
// Also calls renderForeground() to keep AI layer in sync

window.workspaceZoom(amt)
// amt > 0: zoom in, amt < 0: zoom out, amt === 0: reset to 1
// Clamps to 0.5–3, applies as CSS transform: scale() on #canvas-wrapper

window.toggleFullScreen()
// Toggles .app-fullscreen-mode on #playmat-tool-root
// Calls changeSize() after 350ms (transition delay)
```

### Filters (Advanced)

```javascript
window.updateFilters()
// Reads #filter-brightness, #filter-contrast, #filter-saturation
// Applies to 'art' object via Fabric's native filter pipeline:
//   art.filters = [
//     new fabric.Image.filters.Brightness({ brightness }),
//     new fabric.Image.filters.Contrast({ contrast }),
//     new fabric.Image.filters.Saturation({ saturation })
//   ]
//   art.applyFilters()

window.autoOptimizePrintAdv()
// Sets sliders to preset values tuned for print (slight brightness/contrast/sat boost)
// Calls updateFilters()

window.resetFilters()
// Sets all three sliders to 0, calls updateFilters()
```

**Important difference from Quick Upload:** The Advanced Editor uses Fabric's **native filter pipeline** (`art.filters[]` + `art.applyFilters()`), which re-encodes the image texture. The Quick Upload editor uses CSS `ctx.filter` at render time. The Advanced Editor approach is higher quality but slower for large images.

### Accordion

```javascript
window.toggleAcc(id, forceOpen)
// Toggles display of acc-content div
// forceOpen=true: always open (used programmatically after upload)
// Controls the ▼/▲ chevron on the button
```

---

## 8. Sidebar Accordion Panels

Three panels, all using the `.acc-btn` + `.acc-content` pattern:

| Panel | data-acc | Default state |
|-------|----------|---------------|
| ARTWORK | `acc-size` | Open (desktop), Closed (mobile ≤900px) |
| GAME LAYOUT (OPTIONAL) | `acc-layouts` | Closed |
| ADJUSTMENTS | `acc-art` | Closed |

**Programmatic open:** `window.toggleAcc('acc-size', true)` — used after upload to open the Artwork panel.

---

## 9. Game Layout System

Same `LAYOUT_RAW` database as Quick Upload (48+ entries), but with added controls:
- Zone color mode (solid / gradient)
- Secondary color + transparency
- Gradient angle
- Overlay opacity

### Dropdown cascade (Advanced Editor IDs)

| ID | Event | Handler |
|----|-------|---------|
| `#game-sel` | change | `filterFormats()` |
| `#format-sel` | change | `filterHands()` |
| `#hand-sel` | change | `applyFinalLayout()` |

**`applyFinalLayout()`** sets `APP.activeLayoutUrl`, shows `#zone-style-wrap`, calls `renderLayout()`.

### Layout rendering

```javascript
window.renderLayout()
// Draws on #layout-canvas using drawLayoutCanvasCore()
// Reads: APP.activeLayoutUrl, APP.cachedLayoutImg
// After drawing: calls updateRecolorMask() to sync CSS mask for recolor-container
// Also re-applies all erasedPaths via destination-out compositing (re-renders each stroke)
```

**Eraser paths are re-applied on every `renderLayout()` call.** This is how undo works: pop from `APP.erasedPaths`, call `renderLayout()`, which redraws the overlay from scratch then replays remaining paths.

---

## 10. Zone Color & Gradient System

### Controls

| ID | Purpose |
|----|---------|
| `#mode-sel` | `'solid'` or `'gradient'` |
| `#col-1` | Primary color (color picker) |
| `#col-1-hex` | Primary color (hex text input, synced to picker) |
| `#col-2` | Secondary/gradient color (color picker) |
| `#col-2-hex` | Secondary color (hex text input) |
| `#col-2-trans` | Checkbox — make secondary color transparent |
| `#angle-in` | Gradient angle in degrees (0–360), 180° = top→bottom |
| `#angle-compass` | Visual compass indicator (rotates with angle) |
| `#op-in` | Overlay opacity (0.1–1.0, step 0.1) |

`#grad-controls` div is shown/hidden based on `#mode-sel` value. `syncHex()` and `syncColor()` keep pickers and text inputs in sync on every change.

### Rendering logic (in `drawLayoutCanvasCore`)

```
For each game layout:
  1. Draw the layout image (grayscale zone shape) onto a temp canvas
  2. Set globalCompositeOperation = 'source-in'
  3. Fill with either:
     - Solid: fillStyle = col-1.value
     - Gradient: createLinearGradient from col-1 to col-2 (or transparent) at given angle
  4. Set globalAlpha = op-in.value
  5. Draw temp canvas onto layout-canvas
```

**Riftbound special case:** The zone area is clipped to the safe area before filling. The standard layout uses the full canvas extent.

### Opacity

```javascript
window.updateOpacity()
// Reads #op-in value
// Calls renderLayout() — which re-renders the entire overlay including opacity
```

Opacity is applied as `ctx.globalAlpha` when compositing the colored layer onto the layout canvas.

---

## 11. Print Color Correction

Sliders: `#filter-brightness` (−0.3–0.3), `#filter-contrast` (−0.3–0.3), `#filter-saturation` (−0.5–0.5).

Uses Fabric's native filter objects on the `'art'` image. Applied immediately on slider input.

```javascript
window.updateFilters()
const art = canvas.getObjects().find(o => o.name === 'art');
if (!art) return;

art.filters = [
    new fabric.Image.filters.Brightness({ brightness: parseFloat(document.getElementById('filter-brightness').value) }),
    new fabric.Image.filters.Contrast({   contrast:   parseFloat(document.getElementById('filter-contrast').value)   }),
    new fabric.Image.filters.Saturation({ saturation: parseFloat(document.getElementById('filter-saturation').value) })
];
art.applyFilters();
canvas.renderAll();
```

**`autoOptimizePrintAdv()`** — sets sliders to: brightness +0.05, contrast +0.10, saturation +0.15. These were empirically chosen for typical playmat printing conditions.

---

## 12. Text Tool

Text objects are standard Fabric `IText` instances, added to `window.canvas` above the artwork.

```javascript
window.addAdvText()
// Creates fabric.IText("Double Click", {
//   left: canvasW/2, top: canvasH/2,
//   originX: 'center', originY: 'center',
//   fill: '#ffffff', stroke: '#000000', strokeWidth: 2,
//   fontSize: 40, fontFamily: 'Plus Jakarta Sans'
// })
// canvas.bringToFront(t), canvas.setActiveObject(t)
```

### Selection handler

`handleSelection(e)` fires on `selection:created`/`updated`:
- If selected object is `i-text` type: removes `hidden-field` from `#adv-text-tools`, populates all controls from object properties
- Otherwise: adds `hidden-field` back

### Text tool controls

| ID | Property | Range |
|----|----------|-------|
| `#adv-font-family` | `fontFamily` | Rubik, Bangers, Oswald, Permanent Marker, Cinzel, Pacifico |
| `#adv-text-size-in` | `fontSize` | 10–200 px |
| `#adv-text-col` | `fill` | any color |
| `#adv-text-stroke` | `stroke` | any color |

```javascript
window.updateAdvTextAttr(attr, val)
// Gets active object, calls obj.set(attr, val), requestRenderAll()
// For fontFamily: deferred second render after 150ms (font load delay)

window.removeAdvActive()
// canvas.remove(canvas.getActiveObject())
```

### Export handling

Text objects are composited in `buildPrintCanvas` by temporarily scaling `window.canvas` to print resolution, rendering it, and drawing onto the print canvas. The 'art' image is hidden during this step to avoid double-drawing it.

---

## 13. Transform Controls

These operate on whichever object is active on `window.canvas` (art image or text object).

```javascript
window.transformActive(action, val)
// action = 'rotate'  → obj.rotate((obj.angle + 90) % 360)
// action = 'flipX'   → obj.set('flipX', !obj.flipX)
// action = 'flipY'   → obj.set('flipY', !obj.flipY)
// action = 'angle'   → obj.set('angle', parseFloat(val))
// After: canvas.renderAll(), renderForeground(), updateBleedWarnings(), syncTransformUI()

window.resetRotation()
// Calls transformActive('angle', 0)

window.syncTransformUI()
// Reads active object's angle, sets #transform-rotation slider + #rotation-val text
```

| ID | Action |
|----|--------|
| `#adv-rotate-btn` | Rotate 90° |
| `#adv-flipx-btn` | Flip horizontal |
| `#adv-flipy-btn` | Flip vertical |
| `#transform-rotation` | Set exact angle (−180 to +180) |
| `#adv-reset-rotation-btn` | Reset to 0° |

`renderForeground()` is called after every transform so the AI foreground layer stays aligned with the artwork.

---

## 14. Eraser Brush

The eraser modifies `#layout-canvas` directly using the 2D context's `destination-out` composite operation. It does **not** modify `window.canvas` or the Fabric artwork.

### Enable/disable

```javascript
window.toggleMaskMode()
// Mutually exclusive with recolorMode (toggles off if active)
// APP.isMaskMode = !APP.isMaskMode
// Shows/hides #mask-controls
// Sets #eraser-interaction pointer-events: auto/none
```

### Interaction setup (`initEraserInteraction()`)

Mouse/touch events on `#eraser-interaction` (z-index 40):
- `mousedown` / `touchstart` → begin stroke: push `{ size, shape, points: [pt] }` as `currentErasure`
- `mousemove` / `touchmove` → append point, draw `ctx.lineTo + ctx.stroke` on layout-canvas
- `mouseup` / `touchend` → push `currentErasure` to `APP.erasedPaths`, call `updateRecolorMask()`

**Context setup per stroke:**
```javascript
ctx.globalCompositeOperation = 'destination-out';
ctx.lineWidth = currentErasure.size;
ctx.lineCap = currentErasure.shape;     // 'round' or 'square'
ctx.lineJoin = currentErasure.shape === 'round' ? 'round' : 'miter';
```

### Undo / Reset

```javascript
window.undoMask()
// APP.erasedPaths.pop()
// window.renderLayout()  — re-draws overlay from scratch, replays remaining paths

window.resetMask()
// APP.erasedPaths = []
// window.renderLayout()
```

**Undo architecture:** `renderLayout()` always starts with a clean overlay image, then replays every path in `APP.erasedPaths`. There is no incremental undo buffer — undo is achieved by replaying all minus the last.

### Recolor mask sync

```javascript
window.updateRecolorMask()
// Takes #layout-canvas.toDataURL() as a CSS mask-image
// Sets on #recolor-container:
//   mask-image: url(dataUrl)
//   -webkit-mask-image: url(dataUrl)
// This limits recolor strokes to only appear where the layout canvas is opaque
```

Called after every eraser stroke ends, and after `renderLayout()`.

---

## 15. Recolor Brush

The recolor brush uses Fabric's `PencilBrush` on `window.rCanvas` (a separate Fabric canvas overlaid on the layout canvas). Strokes are visually masked by the layout canvas so they only appear over zone areas.

### Enable/disable

```javascript
window.toggleRecolorMode()
// Mutually exclusive with maskMode
// APP.isRecolorMode = !APP.isRecolorMode
// window.rCanvas.isDrawingMode = true/false
// Shows/hides #recolor-controls
// Sets #recolor-container pointer-events: auto/none
```

### Brush configuration

```javascript
window.updateRecolorBrush()
// rCanvas.freeDrawingBrush.width = parseInt(#recolor-size.value)
// rCanvas.freeDrawingBrush.color = #recolor-color.value
// rCanvas.freeDrawingBrush.strokeLineCap = APP.currentBrushShape
// rCanvas.freeDrawingBrush.strokeLineJoin = ...
```

### Undo / Reset

```javascript
window.undoRecolor()
// Removes last object from rCanvas
// rCanvas.remove(objs[objs.length - 1])

window.resetRecolor()
// rCanvas.clear()
```

### Export

Recolor strokes are drawn on `rCanvas` (a Fabric canvas). During `buildPrintCanvas`, the recolor canvas element is composited onto the print canvas after the layout overlay.

---

## 16. AI Features

Both AI features require active Cloudflare Workers that proxy calls to the Replicate API.

### Worker URLs (defined at top of tool.js)

```javascript
window.CLOUDFLARE_WORKER_URL    = 'https://playmat-upscaler.salve.workers.dev'
window.CLOUDFLARE_BG_WORKER_URL = 'https://playmat-removebg.salve.workers.dev/'
window.CLOUDFLARE_UPLOAD_URL    = 'https://files.playmatstudio.com/'   // R2 staging
```

---

### AI Upscaling

**Entry:** `button#ai-upscale-btn-adv` → `confirmAutoUpscale(true)`

**Purpose:** Replace low-resolution artwork with an AI-upscaled version via Replicate.

**Guard conditions (checked before showing confirmation modal):**
- No 'art' object on canvas → error
- Image already ≥ 2,500,000 pixels → "already high resolution" alert

**Full flow:**

```
confirmAutoUpscale(isAdv=true)
  └── show #ai-upscale-modal (confirmation)

runAutoUpscale()   ← user clicks "Proceed" in modal
  ├── get 'art' element, measure naturalWidth/naturalHeight
  ├── if > 2,000,000px: downscale proportionally to fit (pre-processing)
  ├── draw to temp canvas, toBlob(jpeg, 0.85)
  ├── uploadImageToStaging(blob, 'upscale-temp.jpg', 300)
  │     → POST to files.playmatstudio.com
  │     → returns { url: "staging_url" }
  ├── POST to CLOUDFLARE_WORKER_URL
  │     body: { image: "staging_url" }
  │     response: { id: "prediction_id", status: "processing" }
  ├── POLL GET CLOUDFLARE_WORKER_URL?id=<id> every 2s (max 30 attempts)
  │     until status in ['succeeded', 'failed', 'canceled']
  ├── load prediction.output as new fabric.Image (crossOrigin: anonymous)
  ├── if new image is NOT larger than original: show "already high res" alert, abort
  └── replace 'art' object:
        remove old, add new, recalculate baseArtScale
        reset zoom slider, re-apply existing filters
        renderForeground() if aiFgImg present
```

**Request format:**
```
POST https://playmat-upscaler.salve.workers.dev
Content-Type: application/json
{ "image": "<staging_url>" }

Response: { "id": "...", "status": "processing" }

GET  https://playmat-upscaler.salve.workers.dev?id=<prediction_id>
Response: { "id": "...", "status": "succeeded", "output": "<upscaled_image_url>" }
```

---

### AI Frame Break (Background Removal)

**Entry:** `button#ai-fb-btn` → `confirmAutoFrameBreak()`

**Purpose:** Remove the background from the artwork and composite the foreground as a separate layer above the game zone overlay, creating a "pop-out" effect.

**Only available in Advanced Editor.** No equivalent in Quick Upload.

**Full flow:**

```
confirmAutoFrameBreak()
  └── show #ai-warning-modal (explains what frame breaking is)

runAutoFrameBreak()   ← user clicks "Proceed"
  ├── same pre-processing as upscale (downscale if > 2,500,000px, to JPEG)
  ├── uploadImageToStaging(blob, 'bg-temp.jpg', 300)
  ├── POST to CLOUDFLARE_BG_WORKER_URL
  │     body: { image: "staging_url" }
  │     response: { id: "prediction_id", status: "processing" }
  ├── POLL every 2s (max 30 attempts)
  └── on success: prediction.output is a PNG with transparent background
        new Image().src = prediction.output
        onload: APP.aiFgImg = img → renderForeground()
        Show #ai-fb-clear-btn, hide #ai-fb-btn
```

**Request format:** same pattern as upscale, different worker URL.

**`renderForeground()`:**
```javascript
// Draws APP.aiFgImg onto #fg-canvas matching artwork position/scale/rotation/flip/filter
// Uses devicePixelRatio for crisp rendering
// If !APP.aiFgImg: clears fg-canvas
```

**`clearAutoFrameBreak()`:**
```javascript
APP.aiFgImg = null
renderForeground()         // Clears fg-canvas
show #ai-fb-btn, hide #ai-fb-clear-btn
```

---

## 17. Export Pipeline

### Entry points

```javascript
window.downloadDesign('adv')   // Download button (#sidebar-atc)
window.shareDesign('adv')      // Share button (#sidebar-share-btn)
window.openGetPrinted('adv')   // Get Printed button (#sidebar-print-btn)
```

### buildPrintCanvas(isAdv=true, canvas)

```
Print dimensions: SIZE_DB[activeSizeKey].w * 300 × SIZE_DB[activeSizeKey].h * 300
Scale factor:     printW / APP.canvasW

Layer order (composited onto mCanvas):

1. Background color
   if (canvas.backgroundColor): fillRect

2. Artwork
   Direct ctx.drawImage of the art element at print scale
   Applies: translate(cx*scale, cy*scale), rotate, flipX/Y scale, ctx.filter
   Source: art.getElement() (natural resolution image element, not Fabric canvas)

3. Text & other Fabric objects (advanced only)
   Temporarily resize window.canvas to printW×printH, setZoom(scale)
   Hide 'art' to avoid double-drawing
   ctx.drawImage(canvas.getElement())   → gets all text/vector objects at print res
   Restore canvas dimensions

4. Layout overlay
   If APP.activeLayoutUrl !== null:
     drawLayoutCanvasCore() onto temp canvas at print dimensions
     mCtx.drawImage(tCanvas)

5. AI foreground (advanced only)
   If APP.aiFgImg:
     Draw APP.aiFgImg at print scale matching artwork transforms

6. Recolor strokes (advanced only)
   Temporarily resize rCanvas to printW×printH, setZoom(scale)
   ctx.drawImage(rCanvas.getElement())
   Restore rCanvas dimensions

Output: JPEG blob at 95% quality → injectJpegDpi(blob, 300)
```

### DPI injection

```javascript
injectJpegDpi(blob, dpi)
// Parses JPEG bytes, replaces/inserts JFIF APP0 segment
// Embeds: X density = Y density = 300, units = dpi (0x01)
// Result: when opened in Photoshop/Windows Photo, shows 300 DPI
```

---

## 18. Share & Get Printed

Same as Quick Upload — see that document, section 11. Both editors use `shareDesign(mode)` and `openGetPrinted(mode)` with `mode='adv'`.

---

## 19. Zoom & Pan

### Workspace zoom (scales the entire editor view)

```javascript
window.workspaceZoom(amt)
// amt = 0.1: zoom in, -0.1: zoom out, 0: reset
// Clamps: 0.5 to 3
// CSS: #canvas-wrapper { transform: scale(APP.currentZoom) }
// transform-origin: center center
// After: updateCursorStyle() — adjusts brush cursor size inversely to zoom
```

**Toolbar:** `#ws-zoom-in-btn` (+), `#ws-zoom-out-btn` (−), `#ws-zoom-reset-btn` (RESET).

No drag-to-pan in the current implementation. Users scroll the `#canvas-column` container for panning.

### Artwork scale (zoom slider)

```javascript
window.handleZoom(v)
// v: 0.1–2.5 from #zoom-in slider
// art.scale(APP.baseArtScale * v)
// Also: renderForeground()
```

### Brush cursor scaling

```javascript
window.updateCursorStyle()
// Calculates brush size in screen pixels accounting for APP.currentZoom
// Updates #brush-cursor div: width/height = size / zoom
// Cursor follows mouse via the mousemove handler on rCanvas
```

---

## 20. All Event Listeners

```javascript
// Restart / fullscreen
on('adv-restart-btn',  'click', () => window.restartApp())
on('fs-toggle-btn',    'click', () => window.toggleFullScreen())

// Upload
on('adv-upload-file-btn', 'click',  () => document.getElementById('adv-file-in').click())
on('adv-file-in',         'change', function() { window.handleUpload(this) })
on('adv-paste-url-btn',   'click',  () => window.promptPasteUrl())

// AI upscale
on('ai-upscale-btn-adv', 'click', () => window.confirmAutoUpscale(true))

// Solid background color
on('bg-color-picker', 'input', function() {
    window.syncHex('bg-color-picker', 'bg-color-hex')
    window.setSolidBackground(this.value)
})
on('bg-color-hex', 'input', function() {
    window.syncColor('bg-color-hex', 'bg-color-picker')
    window.setSolidBackground(document.getElementById('bg-color-picker').value)
})

// Layout cascade
on('game-sel',   'change', () => window.filterFormats())
on('format-sel', 'change', () => window.filterHands())
on('hand-sel',   'change', () => window.applyFinalLayout())
on('rb-points-sel', 'change', () => window.changeRbPoints())

// Zone color
on('mode-sel',  'change', () => window.renderLayout())
on('col-1',     'input',  function() { window.syncHex('col-1', 'col-1-hex'); window.renderLayout() })
on('col-1-hex', 'input',  function() { window.syncColor('col-1-hex', 'col-1'); window.renderLayout() })
on('col-2',     'input',  function() { window.syncHex('col-2', 'col-2-hex'); window.renderLayout() })
on('col-2-hex', 'input',  function() { window.syncColor('col-2-hex', 'col-2'); window.renderLayout() })
on('col-2-trans', 'change', () => window.renderLayout())
on('angle-in',  'input',  () => window.renderLayout())
on('op-in',     'input',  () => window.updateOpacity())

// Frame breaking & brushes
on('ai-fb-btn',        'click', () => window.confirmAutoFrameBreak())
on('ai-fb-clear-btn',  'click', () => window.clearAutoFrameBreak())
on('mask-toggle-btn',  'click', () => window.toggleMaskMode())
on('brush-size',       'input', () => window.updateCursorStyle())
on('mask-undo-btn',    'click', () => window.undoMask())
on('mask-reset-btn',   'click', () => window.resetMask())
on('recolor-toggle-btn', 'click', () => window.toggleRecolorMode())
on('recolor-size',     'input', () => window.updateRecolorBrush())
on('recolor-color',    'input', () => window.updateRecolorBrush())
on('recolor-undo-btn', 'click', () => window.undoRecolor())
on('recolor-reset-btn','click', () => window.resetRecolor())

// Adjustments
on('filter-brightness', 'input', () => window.updateFilters())
on('filter-contrast',   'input', () => window.updateFilters())
on('filter-saturation', 'input', () => window.updateFilters())
on('auto-opt-btn-adv',  'click', () => window.autoOptimizePrintAdv())
on('adv-reset-colors-btn', 'click', () => window.resetFilters())
on('adv-guides-btn',    'click', () => window.toggleAdvGuides())
on('zoom-in',           'input', function() { window.handleZoom(this.value) })
on('adv-reset-scale-btn', 'click', () => window.forceFit())

// Text tool
on('adv-font-family',   'change', function() { window.updateAdvTextAttr('fontFamily', this.value) })
on('adv-text-size-in',  'input',  function() { window.updateAdvTextAttr('fontSize', parseInt(this.value)) })
on('adv-text-col',      'input',  function() { window.updateAdvTextAttr('fill', this.value) })
on('adv-text-stroke',   'input',  function() { window.updateAdvTextAttr('stroke', this.value) })
on('adv-add-text-btn',  'click',  () => window.addAdvText())
on('adv-delete-btn',    'click',  () => window.removeAdvActive())

// Transforms
on('adv-rotate-btn',        'click', () => window.transformActive('rotate'))
on('adv-flipx-btn',         'click', () => window.transformActive('flipX'))
on('adv-flipy-btn',         'click', () => window.transformActive('flipY'))
on('transform-rotation',    'input', function() { window.transformActive('angle', this.value) })
on('adv-reset-rotation-btn','click', () => window.transformActive('angle', 0))

// Export
on('sidebar-print-btn',  'click', () => window.openGetPrinted('adv'))
on('sidebar-atc',        'click', () => window.downloadDesign('adv'))
on('sidebar-share-btn',  'click', () => window.shareDesign('adv'))

// Workspace zoom
on('ws-zoom-in-btn',    'click', () => window.workspaceZoom(0.1))
on('ws-zoom-out-btn',   'click', () => window.workspaceZoom(-0.1))
on('ws-zoom-reset-btn', 'click', () => window.workspaceZoom(0))

// Shared modals (same as Quick Upload)
on('url-paste-close-x',   'click', () => hide('url-paste-modal'))
on('url-paste-submit',    'click', () => window.submitUrlPaste())
on('bleed-back-btn',      'click', () => window._closeBleedConfirm())
on('bleed-proceed-btn',   'click', () => window._proceedDespiteBleed())
on('dpi-understand-btn',  'click', () => hide('dpi-warning-modal'))
on('share-copy-btn',      'click', () => window.copyShareUrl())
on('print-copy-btn',      'click', () => window.copyPrintUrl())
```

---

## 21. CSS Reference

All in `assets/css/tool.css`.

### Layout

```css
/* Full editor — sidebar + canvas side by side */
#playmat-tool-root {
    display: flex; flex-direction: row;
    max-width: 1400px; height: 90vh; max-height: 900px;
    background: #181228;
}

/* Sidebar: fixed 300px width */
#sidebar { width: 300px; flex-shrink: 0; overflow-y: auto; scrollbar-width: none; }

/* Canvas area: grows to fill remaining space */
#canvas-column { flex-grow: 1; background: #0b0912; overflow: auto; }

/* Canvas wrapper: scaled for workspace zoom */
#canvas-wrapper { position: relative; transform-origin: center center; transition: transform 0.2s; }

/* Zoom toolbar: absolute, top-right of canvas-column */
#zoom-toolbar { position: absolute; top: 14px; right: 14px; }
```

### Accordion

```css
.acc-btn {
    width: 100%; padding: 11px 16px; background: transparent;
    font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;
    text-align: left; display: flex; justify-content: space-between;
    border-bottom: 1px solid rgba(104,48,187,0.2);
}
.acc-btn:hover { background: rgba(104,48,187,0.1); color: #30BBAD; }
.acc-content { padding: 16px; display: none; background: rgba(0,0,0,0.2); }
.acc-content.active { display: block; }
```

### Inner panels

```css
.inner-panel {
    background: rgba(0,0,0,0.2); padding: 15px; border-radius: 6px;
    margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.05);
}
.panel-title { font-size: 12px; font-weight: bold; color: var(--brand-hover); text-transform: uppercase; }
```

### Brush cursor

```css
#brush-cursor {
    position: fixed; pointer-events: none; z-index: 9999999; display: none;
    border: 2px solid #FFFFFF; box-shadow: 0 0 4px #000, inset 0 0 4px #000;
    background: rgba(255,255,255,0.15); transform: translate(-50%, -50%);
    border-radius: 50%;  /* round shape by default */
}
```

### Eraser/recolor active states

```css
.btn-eraser.active  { background: #BB303E; box-shadow: 0 0 12px rgba(187,48,62,0.4); }
.btn-recolor.active { background: #83BB30; box-shadow: 0 0 12px rgba(131,187,48,0.4); }
```

### Fullscreen

```css
.app-fullscreen-mode {
    position: fixed; top: 2%; left: 2%;
    width: 96vw; height: 96vh; max-width: none; max-height: none;
    z-index: 10000;
}
```

### Mobile responsive (≤900px)

```css
@media (max-width: 900px) {
    #playmat-tool-root { flex-direction: column; height: auto; max-height: none; }
    #sidebar { width: 100%; order: 2; }          /* Sidebar below canvas */
    #canvas-column { order: 1; padding: 10px; padding-top: 120px; }  /* Canvas on top */
}
@media (hover: none) and (pointer: coarse) {
    #brush-cursor { display: none !important; }  /* No custom cursor on touch */
}
```

---

## 22. Shared Dependencies

Same shared dependencies as Quick Upload (see that document, section 16), with these additions:

| Dependency | What it does |
|-----------|-------------|
| `drawLayoutCanvasCore(ctx, img, canvas, c1, mode, isAdv, isRiftbound, rbPts, hand, fmt)` | Renders layout with solid or gradient fill; advanced passes `mode`, opacity from `#op-in` |
| `window.CLOUDFLARE_WORKER_URL` | AI upscaler endpoint |
| `window.CLOUDFLARE_BG_WORKER_URL` | AI background removal endpoint |
| `uploadImageToStaging(blob, name, dpi)` | Uploads blob to R2, returns URL (used before sending to AI workers) |

---

## 23. Shopify Migration Notes

See also the Quick Upload handoff (section 17) for general notes. Advanced Editor-specific items:

### AI worker authentication

Currently, the upscaler and BG removal workers accept requests from any origin with no authentication. For Shopify:

1. Pass a Shopify Customer Access Token as a header: `X-Customer-Token: <token>`
2. Validate token in the worker by calling Shopify's Customer API
3. This prevents anonymous use that would exhaust your Replicate API credits

### Frame breaking & the "Get Printed" modal

The `APP.aiFgImg` layer only exists in memory (it is not persisted to R2 except as part of the exported JPEG). If the user navigates away, the AI result is lost. This is intentional. No changes needed unless you want AI results to persist across page loads (requires uploading `aiFgImg` to R2 immediately on receipt).

### Eraser paths — server persistence

`APP.erasedPaths` is in-memory only. If you want to allow users to save/resume designs, you'd need to serialize `erasedPaths` (array of `{size, shape, points[]}` objects) along with the artwork state. This is straightforward JSON but can be large for detailed erasures.

### Recolor canvas — server persistence

`window.rCanvas` Fabric state can be serialized via `rCanvas.toJSON()` and restored via `rCanvas.loadFromJSON()`. Include this alongside eraser paths if implementing design save/resume.

### Fabric.js filter pipeline

The Advanced Editor uses Fabric's native filter pipeline (`art.applyFilters()`), which re-encodes the image into Fabric's WebGL texture. On large images (>5000px) or low-end devices, this can be slow. Consider adding a loading indicator for `autoOptimizePrintAdv()`.

### Replace Get Printed with Shopify Cart

```javascript
// Replace window.openGetPrinted('adv') with:
async function addToCartShopify(mode) {
    const blob = await buildPrintCanvas(mode === 'adv', activeCanvas);
    const url  = await uploadImageToStaging(blob, buildPrintFilename());
    // url is the R2-hosted JPEG link

    await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            items: [{
                id: <shopify_variant_id>,    // Mat size → variant
                quantity: 1,
                properties: { _design_url: url, _mat_size: APP.activeSizeKey }
            }]
        })
    });

    window.location.href = '/cart';
}
```

### Sidebar in Shopify

The sidebar is 300px fixed width with a custom scrollbar. If the Shopify theme has its own left/right panels, you may need to adjust the `#playmat-tool-root` flex layout. The responsive breakpoint at 900px already handles stacking — this may fire earlier than expected depending on where the editor is embedded within the Shopify theme grid.

---

## 24. Known Issues & Gotchas

1. **Eraser only affects `#layout-canvas`, not the artwork.** The eraser cannot erase the artwork itself — it only erases the game zone overlay. If users want to erase the background of their artwork, they must use "Auto Frame Break" (AI) or bring a PNG with transparency.

2. **Eraser paths replay on every `renderLayout()` call.** This means any operation that triggers `renderLayout()` (changing game, changing color, changing opacity, undoing) replays all strokes from scratch. This is O(n) in the number of eraser points and can be slow for highly detailed erasures. Consider debouncing `renderLayout()` if latency is a problem.

3. **Recolor brush mask has a 1-frame lag.** `updateRecolorMask()` calls `layout-canvas.toDataURL()` after each eraser stroke ends. There's a brief moment where the mask doesn't match the eraser state during fast consecutive strokes. This is a known visual artifact.

4. **AI workers are external and have no rate limiting.** Anyone who finds the worker URL can call it directly. Add Cloudflare Rate Limiting rules (10 requests/minute per IP) and authentication before deploying to production.

5. **`buildPrintCanvas` temporarily resizes `window.canvas`** to print dimensions for text rendering. This is done synchronously and restores immediately, but it will cause a visual flash if the user is watching the editor during export. This is a known quirk of Fabric.js's export approach.

6. **`renderForeground` uses `devicePixelRatio`.** On Retina displays, `fg-canvas` is 2× the CSS pixel size. When compositing in `buildPrintCanvas`, ensure you account for this if you ever draw `fg-canvas` directly (current code uses `APP.aiFgImg` directly, bypassing this issue).

7. **Fabric `objectCaching = false` is global.** Setting `fabric.Object.prototype.objectCaching = false` affects all Fabric instances on the page, including `rCanvas`. If you add other Fabric canvases to the page, they will also have caching disabled.

8. **Text font rendering depends on Google Fonts being loaded.** `addAdvText()` defaults to `Plus Jakarta Sans`. If Google Fonts are unavailable (offline, blocked), text will fall back to the browser default. The 150ms deferred render in `updateAdvTextAttr` for `fontFamily` changes handles most async font load cases but may not catch very slow connections.

9. **Gradient angle compass is visual only.** The `#angle-compass` div is updated via CSS rotation but does not accept mouse input. Angle is controlled only via the `#angle-in` range slider.

10. **Workspace zoom does not affect the eraser/recolor coordinate math.** `initEraserInteraction` divides mouse coordinates by `APP.currentZoom` to compensate. If you change the zoom implementation, update the coordinate calculation in `getCoords()` inside `initEraserInteraction`.
