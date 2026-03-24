    fabric.Object.prototype.objectCaching = false;
    fabric.textureSize = 16384;

    var _dbg = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    // Escape HTML special chars before inserting any user-derived string into innerHTML.
    function escHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Sanitise a filename: keep alphanumerics, dots, dashes, underscores; cap at 128 chars.
    function sanitizeFilename(name) {
        return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
    }

    // ============================================================
    // WORKER URLS — update these if workers are redeployed
    // CLOUDFLARE_WORKER_URL    — image upscaler (Replicate AI)
    // CLOUDFLARE_BG_WORKER_URL — background removal (Replicate AI)
    // CLOUDFLARE_UPLOAD_URL    — R2 print file upload
    //   Worker code: playmat-r2-upload-worker.js
    //   Deploy to Cloudflare Workers, bind your R2 bucket,
    //   then replace the URL below with your worker address.
    // ============================================================
    window.CLOUDFLARE_WORKER_URL    = 'https://playmat-upscaler.salve.workers.dev';
    window.CLOUDFLARE_BG_WORKER_URL = 'https://playmat-removebg.salve.workers.dev/';
    window.CLOUDFLARE_UPLOAD_URL    = 'https://files.playmatstudio.com/';
    // Image hosting worker — deploy playmat-host-worker.js to Cloudflare and paste URL here
    window.CLOUDFLARE_HOST_URL = 'https://files.playmatstudio.com';

    // Liquid-injected fallback variant ID (Shopify) — removed in standalone build
    // products that have no [name="id"] input or variant radio buttons on the page.

    // ============================================================
    // FIX 2 (CODE QUALITY): Consolidated all app state into one
    // object instead of ~25 scattered window.* globals.
    // ============================================================
    const APP = {
        isMaskMode:        false,
        isRecolorMode:     false,
        currentZoom:       1,
        currentBrushShape: 'round',
        aiFgImg:           null,
        activeUpscaleEditor: null,
        activeLayoutUrl:   null,
        erasedPaths:       [],
        canvasW:           0,
        canvasH:           0,
        baseArtScale:      1,
        cachedLayoutUrl:   null,
        cachedLayoutImg:   null,
        s_activeLayoutUrl: null,
        s_cachedLayoutImg: null,
        s_baseArtScale:    1,
        // Mat size is set once from the Liquid schema setting — no runtime changes needed.
        // (Shopify cart integration removed in standalone build)PageQty().
        activeSizeKey:     'standard', // overridden by product ID detection below
        canvasSizeMode:    'auto',
        s_filters:         { enhance: false, grayscale: false },
        activePointsUrl:   null,
        _bleedConfirmCallback: null,
    };

    // Keep legacy window aliases so any external code still works
    Object.defineProperties(window, {
        isMaskMode:        { get: () => APP.isMaskMode,        set: v => APP.isMaskMode = v },
        isRecolorMode:     { get: () => APP.isRecolorMode,     set: v => APP.isRecolorMode = v },
        currentZoom:       { get: () => APP.currentZoom,       set: v => APP.currentZoom = v },
        currentBrushShape: { get: () => APP.currentBrushShape, set: v => APP.currentBrushShape = v },
        aiFgImg:           { get: () => APP.aiFgImg,           set: v => APP.aiFgImg = v },
        activeUpscaleEditor: { get: () => APP.activeUpscaleEditor, set: v => APP.activeUpscaleEditor = v },
        activeLayoutUrl:   { get: () => APP.activeLayoutUrl,   set: v => APP.activeLayoutUrl = v },
        erasedPaths:       { get: () => APP.erasedPaths,       set: v => APP.erasedPaths = v },
        canvasW:           { get: () => APP.canvasW,           set: v => APP.canvasW = v },
        canvasH:           { get: () => APP.canvasH,           set: v => APP.canvasH = v },
        baseArtScale:      { get: () => APP.baseArtScale,      set: v => APP.baseArtScale = v },
        cachedLayoutUrl:   { get: () => APP.cachedLayoutUrl,   set: v => APP.cachedLayoutUrl = v },
        cachedLayoutImg:   { get: () => APP.cachedLayoutImg,   set: v => APP.cachedLayoutImg = v },
        s_activeLayoutUrl: { get: () => APP.s_activeLayoutUrl, set: v => APP.s_activeLayoutUrl = v },
        s_cachedLayoutImg: { get: () => APP.s_cachedLayoutImg, set: v => APP.s_cachedLayoutImg = v },
        s_baseArtScale:    { get: () => APP.s_baseArtScale,    set: v => APP.s_baseArtScale = v },
        activeSizeKey:     { get: () => APP.activeSizeKey,     set: v => APP.activeSizeKey = v },
        s_filters:         { get: () => APP.s_filters,         set: v => APP.s_filters = v },
        activePointsUrl:   { get: () => APP.activePointsUrl,   set: v => APP.activePointsUrl = v },
    });

    window.rbPointsImg = new Image();
    window.rbPointsImg.crossOrigin = 'anonymous';

    // SIZE_DB: physical dimensions in inches for each canvas size key.
    // Canvas pixel dimensions = w * 300, h * 300 (all at 300 DPI).
    // Bleed: 0.25" (75px), Safe area: 0.75" (225px) — same for all sizes.
    const SIZE_DB = {
        //                 raw canvas size       customer-facing label
        "standard":  { w: 24.5, h: 14.5, label: '24" x 14"'  },  // Standard Playmat
        "expanded":  { w: 28.5, h: 16.5, label: '28" x 16"'  },  // Expanded Playmat
        "extended":  { w: 28.5, h: 14.5, label: '28" x 14"'  },  // Extended Playmat
        "victor":    { w: 24.0, h: 12.0, label: '24" x 12"'  },  // Victor Deskmat
        "secundus":  { w: 28.0, h: 12.0, label: '28" x 12"'  },  // Secundus Deskmat
        "primus":    { w: 31.0, h: 12.0, label: '31" x 12"'  },  // Primus Deskmat
        "tiro":      { w: 10.0, h:  8.0, label: '10" x 8"'   },  // Tiro Mousepad
        "veteranus": { w: 12.5, h: 10.5, label: '12.5" x 10.5"' },  // Veteranus Mousepad
        "gladiator": { w: 18.0, h: 12.0, label: '18" x 12"'  },  // Gladiator Mousepad
    };

    const LAYOUT_RAW = [
        { game: "Magic: the Gathering", format: "60-card", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/60-Card%20New%20Player%20Standard%20Left%20Handed.webp" },
        { game: "Magic: the Gathering", format: "60-card", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/60-Card%20New%20Player%20Standard%20Right%20Handed.webp" },
        { game: "Magic: the Gathering", format: "60-card", size: "Extended", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/60-Card%20New%20Player%20Extended%20Left%20Handed.webp" },
        { game: "Magic: the Gathering", format: "60-card", size: "Extended", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/60-Card%20New%20Player%20Extended%20Right%20Handed.webp" },
        { game: "Magic: the Gathering", format: "Commander", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/Commander%20New%20Player%20Standard%20Left%20Handed.webp" },
        { game: "Magic: the Gathering", format: "Commander", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/Commander%20New%20Player%20Standard%20Right%20Handed.webp" },
        { game: "Magic: the Gathering", format: "Commander", size: "Extended", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/Commander%20New%20Player%20Extended%20Left%20Handed.webp" },
        { game: "Magic: the Gathering", format: "Commander", size: "Extended", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/Commander%20New%20Player%20Extended%20Right%20Handed.webp" },
        { game: "Pokemon", format: "", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Pokemon%20Overlays/Pokemon%20Left%20Handed%20Standard.webp" },
        { game: "Pokemon", format: "", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Pokemon%20Overlays/Pokemon%20Right%20Handed%20Standard.webp" },
        { game: "Pokemon", format: "", size: "Extended", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Pokemon%20Overlays/Pokemon%20Left%20Handed%20Extended.webp" },
        { game: "Pokemon", format: "", size: "Extended", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Pokemon%20Overlays/Pokemon%20Right%20Handed%20Extended.webp" },
        { game: "Riftbound", format: "Bounded", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Standard%20Left.webp" },
        { game: "Riftbound", format: "Bounded", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Standard%20Right.webp" },
        { game: "Riftbound", format: "Unbounded", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Riftbound_Template_Unbounded_Left.webp" },
        { game: "Riftbound", format: "Unbounded", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Riftbound_Template_Unbounded_Right.webp" },
        { game: "Riftbound", format: "Rubicon Mod", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Rubicon%20Template%20Left%20No%20Points%20With%20Labels.webp" },
        { game: "Riftbound", format: "Rubicon Mod", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Rubicon%20Template%20Right%20No%20Points%20With%20Labels.webp" },
        { game: "Riftbound", format: "Regional Solo Mod", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regionals%20Solo%20Mod%20Left.webp" },
        { game: "Riftbound", format: "Regional Solo Mod", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regionals%20Solo%20Mod%20Right.webp" },
        { game: "Riftbound", format: "Gen Con Solo", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/GenCon%20Solo%20Left.webp" },
        { game: "Riftbound", format: "Gen Con Solo", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/GenCon%20Solo.webp" },
        { game: "Riftbound", format: "Houston Regional", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regional%20Qualifier%20Left.webp" },
        { game: "Riftbound", format: "Houston Regional", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regional%20Qualifier%20Right.webp" },
        { game: "Riftbound", format: "Houston Regional w/ Points", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regional%20Qualifier%20Points%20Left.webp" },
        { game: "Riftbound", format: "Houston Regional w/ Points", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regional%20Qualifier%20Points%20Right.webp" },
        { game: "Riftbound", format: "Points Only", size: "Standard", hand: "Left", url: "" },
        { game: "Riftbound", format: "Points Only", size: "Standard", hand: "Right", url: "" },
        { game: "One Piece", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/One%20Piece.webp" },
        { game: "Neuroscape", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Neuroscape%20Standard.webp" },
        { game: "Neuroscape", format: "", size: "Extended", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Neuroscape%20Extended.webp" },
        { game: "Star Wars: Unlimited", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Star%20Wars%20Unlimited.webp" },
        { game: "Grand Archive", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Grand%20Archive.webp" },
        { game: "Gundam", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Gundam.webp" },
        { game: "Union Arena", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Union%20Arena.webp" },
        { game: "Yu-Gi-Oh", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Yu-Gi-Oh.webp" },
        { game: "Final Fantasy", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Final%20Fantasy.webp" },
        { game: "Sorcery: Contested Realm", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Sorcery%20Contested%20Realm.webp" },
        { game: "Lorcana", format: "", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Lorcana%20Left%20Handed.webp" },
        { game: "Lorcana", format: "", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Lorcana%20Right%20Handed.webp" },
        { game: "SolForge Fusion", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/SolForge%20Fusion.webp" },
        { game: "Digimon", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Digimon.webp" },
        { game: "Altered", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Altered.webp" },
        { game: "Warlord", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Warlord.webp" },
        { game: "Universus", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Universus.webp" },
        { game: "Flesh and Blood", format: "Single Arsenal", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Flesh%20and%20Blood%20Single%20Arsenal.webp" },
        { game: "Flesh and Blood", format: "Double Arsenal", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Flesh%20and%20Blood%20Double%20Arsenal.webp" },
        { game: "Cyberpunk TCG", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Cyberpunk%20Standard.webp" },
        { game: "Cyberpunk TCG", format: "", size: "Extended", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Cyberpunk%20Extended.webp" }
    ];

    window.RB_POINTS_DB = {
        "none": "",
        "basic": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Basic%20Points.webp",
        "basic_1_14": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Basic%20Points%201-14.webp",
        "project": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Project%20Points.webp",
        "project_1_14": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Project%20Points%201-14.webp",
        "lunar": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Lunar%20Points.webp",
        "lunar_1_14": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Lunar%20Points%201-14.webp",
        "khasino": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Khasino%20Points.webp"
    };

    // --- GENERIC IN-APP ALERT ---
    window.showAppAlert = function(title, message, type='info', retryFn=null) {
        const modal      = document.getElementById('app-alert-modal');
        const titleEl    = document.getElementById('app-alert-title');
        const textEl     = document.getElementById('app-alert-text');
        const boxEl      = document.getElementById('app-alert-box');
        const btnEl      = document.getElementById('app-alert-btn');
        const retryBtnEl = document.getElementById('app-alert-retry-btn');
        titleEl.innerText  = title;
        textEl.textContent = message;
        if(type === 'error')        { titleEl.style.color = 'var(--danger-red)';   boxEl.style.borderColor = 'var(--danger-red)';   btnEl.style.background = 'var(--danger-red)'; }
        else if(type === 'success') { titleEl.style.color = 'var(--success-green)';boxEl.style.borderColor = 'var(--success-green)';btnEl.style.background = 'var(--success-green)';}
        else                        { titleEl.style.color = 'var(--brand-hover)';  boxEl.style.borderColor = 'var(--brand-hover)';  btnEl.style.background = 'var(--brand-hover)'; }
        // Show retry button only when a callback is provided (e.g. transient network errors)
        if (retryFn) {
            window._alertRetryFn = retryFn;
            retryBtnEl.style.display = 'block';
            retryBtnEl.style.background = btnEl.style.background;
        } else {
            window._alertRetryFn = null;
            retryBtnEl.style.display = 'none';
        }
        modal.style.display = 'flex';
    };

    // --- CURSOR TRACKING ---
    const trackCursor = (e) => {
        const cursor = document.getElementById('brush-cursor');
        if (!cursor) return;
        if (APP.isMaskMode || APP.isRecolorMode) {
            cursor.style.left    = e.clientX + 'px';
            cursor.style.top     = e.clientY + 'px';
            cursor.style.display = 'block';
            window.updateCursorStyle();
        } else {
            cursor.style.display = 'none';
        }
    };
    document.addEventListener('mousemove', trackCursor);

    // ============================================================
    // IMAGE UPLOAD — Cloudflare R2 via Worker
    // Worker code: playmat-r2-upload-worker.js
    // Deploy instructions are inside that file.
    // Update CLOUDFLARE_UPLOAD_URL below once deployed.
    // ============================================================
    window.buildPrintFilename = function() {
        return 'playmat-' + APP.activeSizeKey + '-' + Date.now() + '.jpg';
    };

    async function uploadImageToStaging(blob, filename) {
        const formData = new FormData();
        formData.append('image', blob, filename);
        const res = await fetch(window.CLOUDFLARE_UPLOAD_URL, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Failed to upload print file. Please try again.');
        const data = await res.json();
        // Handle both imgbb format { data: { url } } and R2 worker format { url }
        const url = data?.data?.url || data?.url;
        if (!url) throw new Error('Upload succeeded but no URL returned.');
        return url;
    }

    // ============================================================
    // BLEED COVERAGE WARNINGS
    // ============================================================

    window.checkArtCoverage = function(ac) {
        var art = ac.getObjects().find(function(o){ return o.name==='art'; });
        if (!art) return true;
        var T=1, br=art.getBoundingRect(true,true);
        return (br.left<=T && br.top<=T &&
                br.left+br.width>=APP.canvasW-T &&
                br.top+br.height>=APP.canvasH-T);
    };

    window.updateBleedWarnings = function(ac) {
        var ok=window.checkArtCoverage(ac), adv=(ac===window.canvas);
        var b=document.getElementById(adv?'adv-bleed-warning':'simple-bleed-warning');
        if(b) b.classList.toggle('visible',!ok);
        var inf=document.getElementById(adv?'adv-info-bar':'simple-info-bar');
        if(inf) inf.classList.toggle('coverage-warn',!ok);
    };

    window._closeBleedConfirm = function() {
        document.getElementById('bleed-confirm-modal').style.display='none';
        APP._bleedConfirmCallback=null;
    };

    window._proceedDespiteBleed = function() {
        document.getElementById('bleed-confirm-modal').style.display='none';
        if(typeof APP._bleedConfirmCallback==='function'){
            APP._bleedConfirmCallback();
            APP._bleedConfirmCallback=null;
        }
    };

    // ============================================================
    // Shared Riftbound layout drawing helper.
    // Used by both the canvas preview and the print export.
    // ============================================================
    function drawRiftboundLayout(ctx, img, canvasW, canvasH, hand, format, rbPointsVal) {
        // Riftbound overlays are designed at standard playmat resolution (7350×4350).
        // Scale factor maps overlay native px → current canvas px.
        const nativeW  = Math.round(24.5 * 300); // 7350 — standard playmat native width
        const bleedPx  = Math.round(0.25 * 300); // 75px bleed at 300 DPI
        const safePx   = Math.round(0.75 * 300); // 225px safe area at 300 DPI
        const s        = canvasW / nativeW;
        const isRight  = (hand === 'Right');

        // Safe area bounds — derived from bleed/safe constants, not hardcoded
        const safeX = safePx * s, safeY = safePx * s;
        const safeW = 6900 * s, safeH = 3900 * s;

        // --- Points strip dimensions ---
        const hasPoints = (rbPointsVal && rbPointsVal !== 'none');
        let pX = 0, pY = 0, pW = 0, pH = 0;
        if (hasPoints) {
            const isWide = rbPointsVal.includes('1_14');
            const basePw = isWide ? 549 : 399;
            pW = basePw * s;
            pH = 3888 * s;
            pY = safeY + (safeH - pH) / 2;                       // vertically centred in safe area
            pX = isRight ? safeX : (safeX + safeW - pW);         // right-hand = left edge; left-hand = right edge
        }

        // --- Available zone for the main overlay ---
        // With points: a 150 native-unit gap (0.5" at 300dpi) sits between the
        // points strip and the overlay zone on all formats.
        // Without points: overlay fills the entire safe area.
        const gap   = hasPoints ? 150 * s : 0;
        const zoneX = hasPoints ? (isRight ? safeX + pW + gap : safeX) : safeX;
        const zoneW = hasPoints ? (safeW - pW - gap) : safeW;
        const zoneH = safeH;

        const imgRatio = img.width / img.height;
        let drawX, drawY, drawW, drawH;
        if (format === 'Unbounded') {
            // Unbounded: full zone width, preserve ratio, bottom-aligned.
            drawW = zoneW;
            drawH = zoneW / imgRatio;
            drawX = zoneX;
            drawY = safeY + safeH - drawH;
        } else if (!hasPoints) {
            // No points: images are designed for the full safe area — stretch
            // to fill zone exactly, no scaling math needed.
            drawW = zoneW;
            drawH = zoneH;
            drawX = zoneX;
            drawY = safeY;
        } else {
            // Points present: zone is narrower. Preserve aspect ratio (contain),
            // centred both axes — prevents horizontal squishing.
            if (imgRatio > zoneW / zoneH) { drawW = zoneW; drawH = zoneW / imgRatio; }
            else                           { drawH = zoneH; drawW = zoneH * imgRatio; }
            drawX = zoneX + (zoneW - drawW) / 2;
            drawY = safeY  + (zoneH - drawH) / 2;
        }
        // Points Only format: no overlay image, just the points strip
        if (format !== 'Points Only' && img && img.width) {
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
        }

        if (hasPoints && window.rbPointsImg && window.rbPointsImg.src) {
            ctx.drawImage(window.rbPointsImg, pX, pY, pW, pH);
        }
    }

    // ============================================================
    // FIX 5 (CODE QUALITY): Shared gradient fill helper.
    // Previously duplicated between renderLayout and the cart flow.
    // ============================================================
    function applyGradientOrSolidFill(ctx, w, h, mode, c1) {
        if (mode === 'gradient') {
            const isTrans  = document.getElementById('col-2-trans').checked;
            const c2       = isTrans ? window.hexToRgba(c1, 0) : document.getElementById('col-2').value;
            const deg      = parseInt(document.getElementById('angle-in').value, 10) || 0;
            const angleRad = (deg - 90) * (Math.PI / 180);
            const cx = w / 2, cy = h / 2;
            // FIX 6: Correct radius formula — was (cx*cx + cy*cy) in the old cart path, now unified
            const r  = Math.sqrt(cx * cx + cy * cy);
            const x0 = cx - Math.cos(angleRad) * r, y0 = cy - Math.sin(angleRad) * r;
            const x1 = cx + Math.cos(angleRad) * r, y1 = cy + Math.sin(angleRad) * r;
            const grad = ctx.createLinearGradient(x0, y0, x1, y1);
            grad.addColorStop(0, c1); grad.addColorStop(1, c2);
            ctx.fillStyle = grad;
        } else {
            ctx.fillStyle = String(c1);
        }
        ctx.fillRect(0, 0, w, h);
    }

    // --- FILTERS ---
    window.autoOptimizePrintAdv = function() {
        const btn = document.getElementById('auto-opt-btn-adv');
        if (btn.dataset.active === 'true') { window.resetFilters(); return; }
        document.getElementById('filter-brightness').value = 0.12;
        document.getElementById('filter-contrast').value   = 0.08;
        document.getElementById('filter-saturation').value = 0.07;
        window.updateFilters();
        btn.dataset.active   = 'true';
        btn.style.background = 'var(--brand-hover)';
        btn.style.color      = 'var(--brand-bg)';
    };

    window.toggleSimpleFilter = function(type) {
        APP.s_filters[type] = !APP.s_filters[type];
        const btn = document.getElementById('s-btn-' + type);
        if (APP.s_filters[type]) { btn.style.background = 'var(--brand-hover)'; btn.style.color = 'var(--brand-bg)'; }
        else                     { btn.style.background = 'transparent'; btn.style.color = 'var(--brand-text-pri)'; }
        window.applySimpleFiltersCore();
    };

    window.applySimpleFiltersCore = function() {
        if (!window.sCanvas) return;
        const art = window.sCanvas.getObjects().find(o => o.name === 'art');
        if (!art) return;
        let filterStr = '';
        if (APP.s_filters.enhance)   filterStr += 'brightness(112%) contrast(108%) saturate(107%) ';
        if (APP.s_filters.grayscale) filterStr += 'grayscale(100%) ';
        art.customFilterStr = filterStr.trim();
        art._render = function(ctx) {
            if (this.customFilterStr) { ctx.save(); ctx.filter = this.customFilterStr; fabric.Image.prototype._render.call(this, ctx); ctx.restore(); }
            else fabric.Image.prototype._render.call(this, ctx);
        };
        window.sCanvas.requestRenderAll();
    };

    window.rotateSimpleArt = function() {
        if (!window.sCanvas) return;
        const art = window.sCanvas.getObjects().find(o => o.name === 'art');
        if (!art) return;
        art.set('angle', ((art.angle || 0) + 90) % 360);
        window.sCanvas.requestRenderAll();
        window.updateBleedWarnings(window.sCanvas);
    };

    // Formats a slider value for display next to the slider
    const _adjFmt = {
        'filter-brightness': v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%',
        'filter-contrast':   v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%',
        'filter-saturation': v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%',
        'filter-vibrance':   v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%',
        'filter-hue':        v => (v > 0 ? '+' : '') + Math.round(v) + '°',
        'filter-blur':       v => parseFloat(v).toFixed(1) + 'px',
        'filter-shadows':    v => (v > 0 ? '+' : '') + Math.round(v),
        'filter-vignette':   v => Math.round(v) + '%',
        'filter-warmth':     v => (v > 0 ? '+' : '') + Math.round(v),
    };
    window.syncSliderDisplays = function() {
        Object.keys(_adjFmt).forEach(id => {
            const el = document.getElementById(id);
            const disp = document.getElementById('val-' + id);
            if (el && disp) disp.textContent = _adjFmt[id](parseFloat(el.value));
        });
    };
    window.resetSingleFilter = function(id, defaultVal) {
        const el = document.getElementById(id); if (!el) return;
        el.value = defaultVal;
        const disp = document.getElementById('val-' + id);
        if (disp) disp.textContent = _adjFmt[id] ? _adjFmt[id](defaultVal) : defaultVal;
        if (id === 'filter-vignette') window.updateVignette(); else window.updateFilters();
    };

    window.resetFilters = function() {
        ['filter-brightness','filter-contrast','filter-saturation','filter-vibrance','filter-hue','filter-blur','filter-shadows','filter-warmth','filter-vignette','filter-grayscale'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = 0;
        });
        const btnAdv = document.getElementById('auto-opt-btn-adv');
        if (btnAdv) { btnAdv.dataset.active = 'false'; btnAdv.style.background = 'transparent'; btnAdv.style.color = 'var(--brand-hover)'; }
        APP.s_filters = { enhance: false, grayscale: false };
        ['enhance','grayscale'].forEach(type => {
            const btn = document.getElementById('s-btn-' + type);
            if (btn) { btn.style.background = 'transparent'; btn.style.color = 'var(--brand-text-pri)'; }
        });
        window.updateFilters();
        window.syncSliderDisplays();
        if (window.sCanvas) window.applySimpleFiltersCore();
    };

    window.updateFilters = function() {
        if (!window.canvas) return;
        const b  = parseFloat(document.getElementById('filter-brightness')?.value || 0);
        const c  = parseFloat(document.getElementById('filter-contrast')?.value   || 0);
        const s  = parseFloat(document.getElementById('filter-saturation')?.value || 0);
        const vb = parseFloat(document.getElementById('filter-vibrance')?.value   || 0);
        const h  = parseFloat(document.getElementById('filter-hue')?.value        || 0);
        const bl = parseFloat(document.getElementById('filter-blur')?.value       || 0);
        const sh = parseFloat(document.getElementById('filter-shadows')?.value    || 0);
        const wm = parseFloat(document.getElementById('filter-warmth')?.value     || 0);
        const gr = parseFloat(document.getElementById('filter-grayscale')?.value  || 0);
        const art = window.canvas.getObjects().find(o => o.name === 'art');
        if (art) {
            let f = '';
            if (b  !== 0) f += `brightness(${100 + b * 100}%) `;
            if (c  !== 0) f += `contrast(${100 + c * 100}%) `;
            if (s  !== 0) f += `saturate(${100 + s * 100}%) `;
            if (h  !== 0) f += `hue-rotate(${h}deg) `;
            if (bl !== 0) f += `blur(${bl}px) `;
            // Shadows: positive = lift (bright+low-contrast), negative = crush (dark+high-contrast)
            if (sh !== 0) {
                const bAdj = 1 + sh * 0.0015;
                const cAdj = 1 - sh * 0.0008;
                f += `brightness(${(bAdj * 100).toFixed(1)}%) contrast(${(cAdj * 100).toFixed(1)}%) `;
            }
            // Warmth: positive = sepia-warm tint, negative = cool hue shift
            if (wm > 0) f += `sepia(${(wm * 0.5).toFixed(1)}%) saturate(${(100 + wm * 0.3).toFixed(1)}%) `;
            if (wm < 0) f += `hue-rotate(${(wm * 0.6).toFixed(1)}deg) saturate(${(100 - wm * 0.2).toFixed(1)}%) `;
            // Vibrance: selective saturation boost/cut layered on top of saturation
            if (vb !== 0) f += `saturate(${Math.max(0, 100 + vb * 100).toFixed(1)}%) `;
            // Grayscale: for B&W preset (driven by hidden input, not a visible slider)
            if (gr > 0) f += `grayscale(${(gr * 100).toFixed(0)}%) `;
            art.customFilterStr = f.trim();
            art._render = function(ctx) {
                if (this.customFilterStr) { ctx.save(); ctx.filter = this.customFilterStr; fabric.Image.prototype._render.call(this, ctx); ctx.restore(); }
                else fabric.Image.prototype._render.call(this, ctx);
            };
            window.canvas.requestRenderAll();
            window.renderForeground();
        }
        window.updateVignette();
        window.syncSliderDisplays();
    };

    window.updateVignette = function() {
        const vCanvas = document.getElementById('vignette-canvas');
        if (!vCanvas) return;
        const strength = parseFloat(document.getElementById('filter-vignette')?.value || 0);
        const w = vCanvas.width, h = vCanvas.height;
        const ctx = vCanvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        if (strength <= 0 || w <= 0 || h <= 0) return;
        const alpha = strength / 100;
        const grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) * 0.7);
        grad.addColorStop(0,   'rgba(0,0,0,0)');
        grad.addColorStop(0.5, `rgba(0,0,0,${(alpha * 0.3).toFixed(3)})`);
        grad.addColorStop(1,   `rgba(0,0,0,${(alpha * 0.95).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    };

    // --- GAME DROPDOWNS ---
    window.populateGameDropdowns = function() {
        // Map activeSizeKey to LAYOUT_RAW size string
        const sizeKeyToName = { standard: 'Standard', extended: 'Extended' };
        const sizeName  = sizeKeyToName[APP.activeSizeKey] || null;
        const allGames  = [...new Set(LAYOUT_RAW.map(i => i.game))].sort();
        const sizeGames = sizeName
            ? new Set(LAYOUT_RAW.filter(i => i.size === sizeName).map(i => i.game))
            : new Set(); // no overlays for this size yet — all grayed out
        const unavailLabel = sizeName ? ' — Standard size only' : ' — Standard size only';
        ['s-game-sel', 'game-sel'].forEach(id => {
            const el = document.getElementById(id); if (!el) return;
            const prev = el.value;
            el.innerHTML = '<option value="">-- Select Game (Optional) --</option>';
            allGames.forEach(g => {
                const available = sizeGames.has(g);
                const opt = document.createElement('option');
                opt.value       = available ? g : '';
                opt.textContent = available ? g : g + unavailLabel;
                opt.disabled    = !available;
                opt.style.color = available ? '' : '#888888';
                el.appendChild(opt);
            });
            if (prev && sizeGames.has(prev)) el.value = prev;
        });
    };

    // --- ACCORDION ---
    window.toggleAcc = (id, forceOpen = false) => {
        const target = document.getElementById(id);
        if (forceOpen) { target.style.display = 'block'; return; }
        target.style.display = target.style.display === 'block' ? 'none' : 'block';
    };

    window.updateLandingVars = () => {
        // Size comes from the Liquid schema setting injected below — nothing to update at runtime.
        window.populateGameDropdowns();
    };

    window.triggerAdvancedFlow = () => {
        // Variant and quantity are read from the page at cart time — nothing to validate here.
        document.getElementById('landing-ui').style.display    = 'none';
        const advBd = document.getElementById('adv-backdrop');
        const isMobile = window.innerWidth <= 900;
        advBd.style.setProperty('--adv-nav-offset', '20px');
        advBd.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        window.initCanvas();
        window.toggleAcc('acc-size', true);
    };

    window.triggerSimpleFlow = () => {
        document.getElementById('simple-file-in').click();
    };

    window._applyNavOffsetToSimple = function() {
        var bd = document.getElementById('simple-backdrop');
        bd.style.setProperty('--adv-nav-offset', '0px');
    };

    // Measure the 
    window.restartApp = () => {
        location.reload();
        return;
        var _dvw  = document.getElementById('designer-visibility-wrapper');
        var _rsbd = document.getElementById('simple-backdrop');
        var _rabd = document.getElementById('adv-backdrop');
        if (_rsbd.classList.contains('tab-mode')) {
            _rsbd.classList.remove('tab-mode');
            if (_dvw) _dvw.appendChild(_rsbd);
        }
        if (_rabd.classList.contains('tab-mode')) {
            _rabd.classList.remove('tab-mode');
            if (_dvw) _dvw.appendChild(_rabd);
        }
        document.getElementById('adv-backdrop').style.display       = 'none';
        document.getElementById('simple-backdrop').style.display      = 'none';
        document.body.style.overflow = '';
        document.getElementById('landing-ui').style.display          = 'block';
        if (APP.isMaskMode)    window.toggleMaskMode();
        if (APP.isRecolorMode) window.toggleRecolorMode();
        if (window.canvas)  { window.canvas.clear();  window.canvas.dispose();  window.canvas  = null; }
        if (window.rCanvas) { window.rCanvas.clear(); window.rCanvas.dispose(); window.rCanvas = null; }
        if (window.sCanvas) { window.sCanvas.clear(); window.sCanvas.dispose(); window.sCanvas = null; }
        const cursor = document.getElementById('brush-cursor');
        if (cursor) cursor.style.display = 'none';
        APP.activeLayoutUrl   = null;
        APP.s_activeLayoutUrl = null;
        APP.cachedLayoutUrl   = null;
        APP.cachedLayoutImg   = null;
        APP.s_cachedLayoutImg = null;
        APP.canvasW           = 0;
        APP.canvasH           = 0;
        APP.erasedPaths       = [];
        APP.aiFgImg           = null;
        APP._bleedConfirmCallback = null;
        ["adv-bleed-warning","simple-bleed-warning"].forEach(function(id){ var el=document.getElementById(id); if(el) el.classList.remove("visible"); });
        ["adv-info-bar","simple-info-bar"].forEach(function(id){ var el=document.getElementById(id); if(el) el.classList.remove("coverage-warn"); });
        window.resetFilters();
        var _afi = document.getElementById('adv-file-in'); if(_afi) _afi.value='';
        var _sfi = document.getElementById('simple-file-in'); if(_sfi) _sfi.value='';
    };

    window.openHelpModal = () => { document.getElementById('dpi-warning-modal').style.display = 'none'; document.getElementById('help-modal').style.display = 'flex'; };
    // Use DOMContentLoaded if the DOM isn't ready yet, otherwise run immediately.
    // Snippets loaded via Custom Liquid blocks often miss DOMContentLoaded.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.updateLandingVars();
            window.initDesignerVisibility();
        });
    } else {
        window.updateLandingVars();
        window.initDesignerVisibility();
    }

    // ============================================================
    // VARIANT-TRIGGERED VISIBILITY
    // Reads the Liquid schema setting 'trigger_variant'.
    // - If blank: designer is always visible.
    // - If set (e.g. "Custom Artwork"): designer only shows when
    //   the selected variant's Option1 matches that text
    //   (case-insensitive). Listens to the change event on the
    //   hidden [ref="variantId"] input that Shopify updates on
    //   every variant switch.
    // ============================================================
    window.initDesignerVisibility = function() {
        document.getElementById('designer-visibility-wrapper').style.display = '';
        window.updateInfoBars(null);
        window.populateGameDropdowns();
        // Auto-open the Quick Upload tab so the canvas is ready immediately,
        // unless the page was loaded with #upload hash (Etsy customer link).
        if (window.location.hash === '#upload') {
            setTimeout(function() {
                window.switchTab('host');
                var banner = document.getElementById('upload-customer-banner');
                if (banner) { banner.style.display = 'block'; }
            }, 100);
        } else {
            setTimeout(function() { window.switchTab('adv-editor'); }, 0);
        }
        window.renderHostHistory();
        window.initEventListeners();
    };

    // --- DPI CHECKER ---
    // Update the info bars in both editors with current mat size and image DPI
    window.updateInfoBars = function(img) {
        const conf     = SIZE_DB[APP.activeSizeKey];
        const sizeText = `Mat size: ${conf.label || conf.w + '\" × ' + conf.h + '\"'}`;
        const dpiText  = img
            ? `Image DPI: ${Math.round(Math.min(img.width / conf.w, img.height / conf.h))}`
            : 'Image DPI: —';

        // Quick Upload bar
        const si = document.getElementById('si-size');
        const sd = document.getElementById('si-dpi');
        if (si) si.textContent = sizeText;
        if (sd) sd.textContent = dpiText;

        // Advanced Editor bar
        const ai = document.getElementById('ai-size');
        const ad = document.getElementById('ai-dpi');
        if (ai) ai.textContent = sizeText;
        if (ad) ad.textContent = dpiText;
    };

    window.checkDPI = function(img) {
        const conf = SIZE_DB[APP.activeSizeKey];
        const effectiveDpi = Math.round(Math.min(img.width / conf.w, img.height / conf.h));
        window.updateInfoBars(img); // update bars whenever we have an image
        if (effectiveDpi < 300) {
            document.getElementById('dpi-warning-text').innerText =
                `Your artwork is roughly ${effectiveDpi} DPI based on the selected mat size.\n\nWe recommend 300 DPI for the best print quality. Your playmat may print slightly blurry or pixelated.`;
            document.getElementById('dpi-warning-modal').style.display = 'flex';
        }
    };

    // ============================================================
    // FIX 7: URL import now validates that the URL looks like a
    // real image before attempting to load it.
    // ============================================================
    window.promptPasteUrl = () => {
        document.getElementById('paste-url-input').value = '';
        document.getElementById('url-paste-modal').style.display = 'flex';
    };

    window.submitUrlPaste = () => {
        const url = document.getElementById('paste-url-input').value.trim();
        if (!url) return;

        // Validate: must be http/https and end with a recognised image extension
        if (!url.startsWith('http') || !/\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(url)) {
            window.showAppAlert("Invalid URL", "Please paste a direct link to an image file (ending in .jpg, .png, .webp, etc.).", "error");
            return;
        }
        window.loadRemoteArt(url);
    };

    window.loadRemoteArt = (url) => {
        document.getElementById('url-paste-modal').style.display = 'none';
        const isAdv = document.getElementById('adv-backdrop').classList.contains('tab-mode') || document.getElementById('adv-backdrop').style.display === 'flex';

        // FIX 8: Always initialise the simple canvas before trying to use it
        if (!isAdv) {
            var _lsbd = document.getElementById('simple-backdrop');
            if (!_lsbd.classList.contains('tab-mode')) {
                document.getElementById('landing-ui').style.display = 'none';
                window._applyNavOffsetToSimple();
                _lsbd.style.display = 'flex';
            }
            window.initSimpleCanvas();
        }

        // H3: Block SSRF — reject private IPs, loopback, and non-routable hostnames
        // before passing the URL through a third-party CORS proxy.
        try {
            const _parsed = new URL(url);
            if (!/^https?:$/i.test(_parsed.protocol)) throw new Error('bad scheme');
            const _host = _parsed.hostname.toLowerCase();
            if (
                _host === 'localhost' ||
                /^127\./.test(_host) ||
                /^10\./.test(_host) ||
                /^192\.168\./.test(_host) ||
                /^172\.(1[6-9]|2\d|3[01])\./.test(_host) ||
                /^169\.254\./.test(_host) ||
                /^::1$/.test(_host) ||
                /^0\.0\.0\.0$/.test(_host) ||
                !_host.includes('.')   // bare hostnames with no dot
            ) throw new Error('private host');
        } catch (_urlErr) {
            window.showAppAlert("Invalid URL", "That URL cannot be used as an image source. Please paste a public image URL.", "error");
            return;
        }

        const proxies = [
            `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=webp`,
            `https://corsproxy.io/?${encodeURIComponent(url)}`
        ];

        const tryLoad = (index) => {
            if (index >= proxies.length) {
                // FIX 9: Was referencing a non-existent 'url-error-modal' element
                window.showAppAlert("Import Failed", "Could not load that image. Try downloading it and uploading the file directly.", "error");
                return;
            }
            fabric.Image.fromURL(proxies[index], (img, isError) => {
                if (isError || !img || img.width === 0 || img.height === 0) { tryLoad(index + 1); return; }
                window.resetFilters();
                window.checkDPI(img);
                img.set({ name: 'art', originX: 'center', originY: 'center' });
                const targetCanvas = isAdv ? window.canvas : window.sCanvas;
                targetCanvas.getObjects().forEach(o => { if (o.name === 'art') targetCanvas.remove(o); });
                targetCanvas.add(img).sendToBack(img);
                if (isAdv) {
                    window.clearAutoFrameBreak(); window.forceFit(); window.toggleAcc('acc-size', true);
                } else {
                    APP.s_baseArtScale = Math.max(APP.canvasW / img.width, APP.canvasH / img.height);
                    img.scale(APP.s_baseArtScale).set({ left: APP.canvasW / 2, top: APP.canvasH / 2, angle: 0 });
                    document.getElementById('s-zoom-in').value = 1;
                    window.sCanvas.renderAll();
                }
                window.updateBleedWarnings(targetCanvas);
            }, { crossOrigin: 'anonymous' });
        };
        tryLoad(0);
    };

    // --- AI UPSCALER ---
    window.confirmAutoUpscale = (isAdv) => {
        APP.activeUpscaleEditor = isAdv ? 'adv' : 'simple';
        const targetCanvas = isAdv ? window.canvas : window.sCanvas;
        const art = targetCanvas.getObjects().find(o => o.name === 'art');
        if (!art) { window.showAppAlert("Missing Artwork", "Please upload artwork first.", "error"); return; }
        if ((art.getElement().width * art.getElement().height) >= 2500000) {
            window.showAppAlert("Image Too Large", "This image is already highly detailed! The AI Enhancer is designed for small, blurry images.", "info");
            return;
        }
        document.getElementById('ai-upscale-modal').style.display = 'flex';
    };

    window.runAutoUpscale = async () => {
        document.getElementById('ai-upscale-modal').style.display = 'none';
        const isAdv        = APP.activeUpscaleEditor === 'adv';
        const targetCanvas = isAdv ? window.canvas : window.sCanvas;
        const btn          = document.getElementById(isAdv ? 'ai-upscale-btn-adv' : 'ai-upscale-btn-simple');
        btn.innerHTML = 'ENHANCING (CLOUD)...<br><span style="font-size:10px;font-weight:normal;">(Please wait 5-15s)</span>';
        btn.disabled  = true;

        try {
            const art      = targetCanvas.getObjects().find(o => o.name === 'art');
            if (!art) throw new Error('No artwork found.');
            const imgEl    = art.getElement();
            let targetW    = imgEl.naturalWidth  || imgEl.width;
            let targetH    = imgEl.naturalHeight || imgEl.height;
            const origArea = targetW * targetH;
            const maxPx    = 2000000;
            if (origArea > maxPx) { const r = Math.sqrt(maxPx / origArea); targetW = Math.round(targetW * r); targetH = Math.round(targetH * r); }
            const tempC = document.createElement('canvas');
            tempC.width = targetW; tempC.height = targetH;
            tempC.getContext('2d').drawImage(imgEl, 0, 0, targetW, targetH);
            const blob = await new Promise(res => tempC.toBlob(res, 'image/jpeg', 0.85));

            // FIX 1 in action: upload goes through the worker, no key in frontend
            const tinyImgUrl = await uploadImageToStaging(blob, 'upscale-temp.jpg', 300);

            const startRes = await fetch(window.CLOUDFLARE_WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: tinyImgUrl })
            });
            if (!startRes.ok) throw new Error('Failed to contact secure upscaler bridge.');
            let prediction = await startRes.json();
            if (prediction.detail || prediction.error || !prediction.id) throw new Error('Internal AI Server Error');

            let attempts = 0;
            while (!['succeeded','failed','canceled'].includes(prediction.status)) {
                if (attempts++ > 30) throw new Error('AI Server timed out.');
                await new Promise(r => setTimeout(r, 2000));
                const _u1 = new URL(window.CLOUDFLARE_WORKER_URL); _u1.searchParams.set('id', prediction.id);
                const pollRes = await fetch(_u1);
                if (!pollRes.ok) throw new Error('Failed to poll AI status.');
                prediction = await pollRes.json();
            }
            if (prediction.status !== 'succeeded') throw new Error('AI Cloud processing failed.');

            fabric.Image.fromURL(prediction.output, (newImg) => {
                if ((newImg.width * newImg.height) < (origArea * 0.9)) {
                    btn.innerHTML = '✨ ENHANCE QUALITY <span class="beta-badge">BETA</span>'; btn.disabled = false;
                    window.showAppAlert("Resolution Preserved", "Your original image is already at a higher resolution than the AI output. No changes were made.", "info");
                    return;
                }
                window.checkDPI(newImg);
                if (art.customFilterStr) { newImg.customFilterStr = art.customFilterStr; newImg._render = art._render; }
                newImg.set({ name: 'art', originX: 'center', originY: 'center' });
                targetCanvas.remove(art); targetCanvas.add(newImg).sendToBack(newImg);
                if (isAdv) {
                    APP.baseArtScale = Math.max(APP.canvasW / newImg.width, APP.canvasH / newImg.height);
                    newImg.scale(APP.baseArtScale).set({ left: APP.canvasW/2, top: APP.canvasH/2, angle:0, flipX:false, flipY:false });
                    document.getElementById('zoom-in').value = 1;
                    document.getElementById('transform-rotation').value = 0; document.getElementById('rotation-val').innerText = '0°';
                    targetCanvas.renderAll(); window.updateFilters();
                    if (APP.aiFgImg) window.renderForeground();
                    window.toggleAcc('acc-size', true);
                } else {
                    APP.s_baseArtScale = Math.max(APP.canvasW / newImg.width, APP.canvasH / newImg.height);
                    newImg.scale(APP.s_baseArtScale).set({ left: APP.canvasW/2, top: APP.canvasH/2, angle:0 });
                    document.getElementById('s-zoom-in').value = 1;
                    window.applySimpleFiltersCore();
                }
                window.updateBleedWarnings(targetCanvas);
                btn.innerHTML = '✨ ENHANCE QUALITY <span class="beta-badge">BETA</span>'; btn.disabled = false;
                document.getElementById('ai-success-modal').style.display = 'flex';
            }, { crossOrigin: 'anonymous' });

        } catch (err) {
            _dbg && console.error('Upscale Error:', err);
            window.showAppAlert("Enhancement Failed", "An unexpected error occurred. Please contact support if this continues.", "error");
            btn.innerHTML = '✨ ENHANCE QUALITY <span class="beta-badge">BETA</span>'; btn.disabled = false;
        }
    };

    // --- SIMPLE CANVAS ---
    window.handleSimpleUpload = (input) => {
        if (!input.files[0]) return;
        var _sbd = document.getElementById('simple-backdrop');
        if (!_sbd.classList.contains('tab-mode')) {
            document.getElementById('landing-ui').style.display = 'none';
            window._applyNavOffsetToSimple();
            _sbd.style.display = 'flex';
        }
        window.initSimpleCanvas();
        const r = new FileReader();
        r.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (img) => {
                window.resetFilters(); window.checkDPI(img);
                img.set({ name: 'art', originX: 'center', originY: 'center' });
                window.sCanvas.getObjects().forEach(o => { if (o.name === 'art') window.sCanvas.remove(o); });
                window.sCanvas.add(img).sendToBack(img);
                const el = img.getElement();
                const srcW = (el && el.naturalWidth)  || img.width;
                const srcH = (el && el.naturalHeight) || img.height;
                APP.s_baseArtScale = Math.max(APP.canvasW / srcW, APP.canvasH / srcH);
                img.scale(APP.s_baseArtScale).set({ left: APP.canvasW/2, top: APP.canvasH/2 });
                document.getElementById('s-zoom-in').value = 1;
                window.sCanvas.renderAll();
                window.updateBleedWarnings(window.sCanvas);
            });
        };
        r.readAsDataURL(input.files[0]);
    };

    window.initSimpleCanvas = () => {
        if (!window.sCanvas) {
            window.sCanvas = new fabric.Canvas('s-main-canvas', { backgroundColor: '#000', preserveObjectStacking: true });
            window.sCanvas.on('selection:created', window.handleSimpleSelection);
            window.sCanvas.on('selection:updated', window.handleSimpleSelection);
            window.sCanvas.on('selection:cleared', () => {
                // FIX 10: was referencing non-existent 's-text-tools' element — now safely guarded
                const el = document.getElementById('s-text-tools');
                if (el) el.classList.add('hidden-field');
            });
            window.sCanvas.on('object:modified', function(){ window.updateBleedWarnings(window.sCanvas); });
            window.sCanvas.on('object:added',    function(){ window.updateBleedWarnings(window.sCanvas); });
        }
        const conf = SIZE_DB[APP.activeSizeKey];
        const wrap = document.getElementById('simple-canvas-wrap');
        const maxW = wrap.clientWidth - 40;
        const maxH = wrap.clientHeight - 40;
        let cW = maxW, cH = cW / (conf.w / conf.h);
        if (cH > maxH && maxH > 100) { cH = maxH; cW = cH * (conf.w / conf.h); }
        APP.canvasW = cW; APP.canvasH = cH;
        window.sCanvas.setDimensions({ width: APP.canvasW, height: APP.canvasH });
        document.getElementById('simple-canvas-inner').style.width  = APP.canvasW + 'px';
        document.getElementById('simple-canvas-inner').style.height = APP.canvasH + 'px';
        window.drawSimpleGuides(APP.canvasW, APP.canvasH, conf.w);
    };

    window.drawSimpleGuides = function(w, h, inches) {
        window.sCanvas.getObjects().forEach(o => { if (o.name === 'guides') window.sCanvas.remove(o); });
        const ppi = w / inches, bleed = 0.25 * ppi, safe = 0.75 * ppi;
        const bleedFrame = new fabric.Path(`M 0 0 H ${w} V ${h} H 0 Z M ${bleed} ${bleed} V ${h-bleed} H ${w-bleed} V ${bleed} Z`, { fill:'rgba(255,0,0,0.25)', selectable:false, evented:false, fillRule:'evenodd' });
        const safeFrame  = new fabric.Path(`M ${bleed} ${bleed} H ${w-bleed} V ${h-bleed} H ${bleed} Z M ${safe} ${safe} V ${h-safe} H ${w-safe} V ${safe} Z`, { fill:'rgba(255,255,0,0.15)', selectable:false, evented:false, fillRule:'evenodd' });
        const g = new fabric.Group([bleedFrame, safeFrame], { name:'guides', selectable:false, evented:false });
        window.sCanvas.add(g); g.bringToFront();
    };

    window.toggleSimpleGuides = () => { const g = window.sCanvas.getObjects().find(o => o.name==='guides'); if(g) { g.visible = !g.visible; window.sCanvas.renderAll(); } };
    window.handleSimpleZoom    = (v)  => { const img = window.sCanvas.getObjects().find(o=>o.name==='art'); if(img && APP.s_baseArtScale) { img.scale(APP.s_baseArtScale * parseFloat(v)); window.sCanvas.renderAll(); } if(window.sCanvas) window.updateBleedWarnings(window.sCanvas); };
    window.forceSimpleFit      = ()   => { const img = window.sCanvas.getObjects().find(o=>o.name==='art'); if(!img) return; const el=img.getElement(); const srcW=(el&&el.naturalWidth)||img.width; const srcH=(el&&el.naturalHeight)||img.height; APP.s_baseArtScale = Math.max(APP.canvasW/srcW, APP.canvasH/srcH); img.scale(APP.s_baseArtScale).set({ left:APP.canvasW/2, top:APP.canvasH/2, angle:0 }); document.getElementById('s-zoom-in').value=1; window.sCanvas.renderAll(); window.updateBleedWarnings(window.sCanvas); };
    window.triggerUpload       = ()   => { document.getElementById('adv-file-in').click(); };

    window._fsOrigParent = null;
    window._fsOrigNextSibling = null;
    window._fsOrigStyle = '';

    function _applyFsStyles(el) {
        var props = [
            ['position','fixed'],['top','5vh'],['left','5vw'],['width','90vw'],
            ['height','90vh'],['max-width','90vw'],['max-height','90vh'],
            ['right','auto'],['bottom','auto'],['margin','0'],
            ['box-sizing','border-box'],['z-index','999999'],['border-radius','6px']
        ];
        props.forEach(function(p){ el.style.setProperty(p[0], p[1], 'important'); });
    }
    function _clearFsStyles(el) {
        ['position','top','left','width','height','max-width','max-height',
         'right','bottom','margin','box-sizing','z-index','border-radius'].forEach(function(p){
            el.style.removeProperty(p);
        });
    }

    window.toggleFullScreen = function() {
        const root = document.getElementById('playmat-tool-root');
        const btn  = document.getElementById('fs-toggle-btn');
        const bd   = document.getElementById('fs-backdrop');
        const entering = !root.classList.contains('app-fullscreen-mode');
        if (entering) {
            window._fsOrigParent = root.parentNode;
            window._fsOrigNextSibling = root.nextSibling;
            window._fsOrigStyle = root.getAttribute('style') || '';
            document.body.appendChild(root);
            _applyFsStyles(root);
            root.classList.add('app-fullscreen-mode');
            bd.style.display = 'block';
            btn.innerText = 'EXIT FULL SCREEN';
            btn.style.background = 'var(--danger-red)';
            document.body.style.overflow = 'hidden';
        } else {
            root.classList.remove('app-fullscreen-mode');
            _clearFsStyles(root);
            if (window._fsOrigStyle) { root.setAttribute('style', window._fsOrigStyle); }
            if (window._fsOrigParent) {
                window._fsOrigParent.insertBefore(root, window._fsOrigNextSibling || null);
            }
            bd.style.display = 'none';
            btn.innerText = 'FULL SCREEN';
            btn.style.background = 'var(--brand-hover)';
            document.body.style.overflow = '';
        }
        setTimeout(() => window.changeSize(), 350);
    };

    window._sfsOrigParent = null;
    window._sfsOrigNextSibling = null;
    window._sfsOrigStyle = '';

    window.toggleSimpleFullScreen = function() {
        const modal = document.getElementById('simple-modal');
        const btn   = document.getElementById('s-fs-toggle-btn');
        const entering = !modal.classList.contains('simple-fullscreen-mode');
        if (entering) {
            window._sfsOrigParent = modal.parentNode;
            window._sfsOrigNextSibling = modal.nextSibling;
            window._sfsOrigStyle = modal.getAttribute('style') || '';
            document.body.appendChild(modal);
            _applyFsStyles(modal);
            modal.classList.add('simple-fullscreen-mode');
            btn.innerText = '⛶ EXIT FULL SCREEN';
            btn.style.background = 'var(--danger-red)';
            document.body.style.overflow = 'hidden';
        } else {
            modal.classList.remove('simple-fullscreen-mode');
            _clearFsStyles(modal);
            if (window._sfsOrigStyle) { modal.setAttribute('style', window._sfsOrigStyle); }
            if (window._sfsOrigParent) {
                window._sfsOrigParent.insertBefore(modal, window._sfsOrigNextSibling || null);
            }
            btn.innerText = '⛶ FULL SCREEN';
            btn.style.background = 'var(--brand-hover)';
            document.body.style.overflow = '';
        }
    };

    window.selectMatSize = function(sizeKey, btn) {
        APP.activeSizeKey = sizeKey;
        document.querySelectorAll('.mat-size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window.populateGameDropdowns();
        window.updateInfoBars(null);
        // Resize whichever canvas is currently active
        if (window.canvas) window.changeSize();
        if (window.sCanvas) window.initSimpleCanvas();
    };

    window.workspaceZoom = (amt) => {
        if (amt === 0) APP.currentZoom = 1; else APP.currentZoom += amt;
        APP.currentZoom = Math.max(0.5, Math.min(APP.currentZoom, 3));
        document.getElementById('canvas-wrapper').style.transform = `scale(${APP.currentZoom})`;
        window.updateCursorStyle();
    };

    window.initCanvas = function() {
        if (!window.canvas) {
            window.canvas  = new fabric.Canvas('main-canvas',    { backgroundColor:'#000', preserveObjectStacking:true });
            window.rCanvas = new fabric.Canvas('recolor-canvas', { backgroundColor:null });
            window.rCanvas.freeDrawingCursor = 'none';
            window.rCanvas.on('mouse:move', (o) => { if(o.e) trackCursor(o.e); });
            window.canvas.on('selection:created', window.handleSelection);
            window.canvas.on('selection:updated', window.handleSelection);
            window.canvas.on('selection:cleared', () => {
                document.getElementById('adv-text-tools').classList.add('hidden-field');
                window.syncTransformUI();
            });
            window.canvas.on('object:modified', function(){ window.updateBleedWarnings(window.canvas); });
            window.canvas.on('object:added',    function(){ window.updateBleedWarnings(window.canvas); });
            window.initEraserInteraction();
        }
        window.changeSize();
    };

    window.transformActive = function(action, val) {
        const obj = window.canvas.getActiveObject() || window.canvas.getObjects().find(o => o.name==='art');
        if (!obj) return;
        if (obj.originX !== 'center' || obj.originY !== 'center') {
            const c = obj.getCenterPoint(); obj.set({ originX:'center', originY:'center', left:c.x, top:c.y });
        }
        if      (action==='rotate') obj.rotate((obj.angle||0)+90);
        else if (action==='flipX')  obj.set('flipX', !obj.flipX);
        else if (action==='flipY')  obj.set('flipY', !obj.flipY);
        else if (action==='angle')  obj.set('angle', parseFloat(val));
        let angle = Math.round(obj.angle||0) % 360;
        if (angle > 180) angle -= 360; if (angle <= -180) angle += 360;
        document.getElementById('transform-rotation').value = angle;
        document.getElementById('rotation-val').innerText   = angle + '°';
        window.canvas.requestRenderAll(); window.renderForeground();
        window.updateBleedWarnings(window.canvas);
    };

    window.syncTransformUI = function() {
        const obj = window.canvas.getActiveObject() || window.canvas.getObjects().find(o => o.name==='art');
        if (obj) {
            let angle = Math.round(obj.angle||0) % 360; if(angle>180) angle-=360; if(angle<=-180) angle+=360;
            document.getElementById('transform-rotation').value = angle; document.getElementById('rotation-val').innerText = angle+'°';
        } else { document.getElementById('transform-rotation').value=0; document.getElementById('rotation-val').innerText='0°'; }
    };

    window.initEraserInteraction = function() {
        const eraserEl = document.getElementById('eraser-interaction');
        let isErasing = false, currentErasure = null;
        const getCoords = (e) => {
            const rect = eraserEl.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return { x:(clientX-rect.left)/APP.currentZoom, y:(clientY-rect.top)/APP.currentZoom };
        };
        const startErase = (e) => {
            if (!APP.isMaskMode) return; if(e.type==='touchstart') e.preventDefault();
            isErasing = true;
            const pt = getCoords(e);
            currentErasure = { size:parseInt(document.getElementById('brush-size').value,10), shape:APP.currentBrushShape, points:[pt] };
            const ctx = document.getElementById('layout-canvas').getContext('2d');
            ctx.globalCompositeOperation='destination-out'; ctx.lineWidth=currentErasure.size; ctx.lineCap=currentErasure.shape; ctx.lineJoin=currentErasure.shape==='round'?'round':'miter';
            ctx.beginPath(); ctx.moveTo(pt.x,pt.y); ctx.lineTo(pt.x+0.01,pt.y); ctx.stroke();
        };
        const moveErase = (e) => {
            if (!isErasing) return; if(e.type==='touchmove') e.preventDefault();
            const pt = getCoords(e); currentErasure.points.push(pt);
            const ctx = document.getElementById('layout-canvas').getContext('2d');
            ctx.lineTo(pt.x,pt.y); ctx.stroke();
        };
        const endErase = () => { if(isErasing) { isErasing=false; APP.erasedPaths.push(currentErasure); window.updateRecolorMask(); } };
        eraserEl.addEventListener('mousedown',  startErase);
        eraserEl.addEventListener('touchstart', startErase, {passive:false});
        window.addEventListener('mousemove',  moveErase);
        window.addEventListener('touchmove',  moveErase, {passive:false});
        window.addEventListener('mouseup',    endErase);
        window.addEventListener('touchend',   endErase);
    };

    window.toggleMaskMode = function() {
        if (APP.isRecolorMode) window.toggleRecolorMode();
        APP.isMaskMode = !APP.isMaskMode;
        const btn = document.getElementById('mask-toggle-btn'), ctrl = document.getElementById('mask-controls'), interaction = document.getElementById('eraser-interaction');
        if (APP.isMaskMode) { btn.innerText='EXIT ERASER'; btn.classList.add('active'); ctrl.classList.remove('hidden-field'); interaction.style.pointerEvents='auto'; window.updateCursorStyle(); }
        else { btn.innerText='ENABLE MANUAL ERASER'; btn.classList.remove('active'); ctrl.classList.add('hidden-field'); interaction.style.pointerEvents='none'; const c=document.getElementById('brush-cursor'); if(c) c.style.display='none'; }
    };

    window.undoMask  = () => { if(APP.erasedPaths.length>0) { APP.erasedPaths.pop(); window.renderLayout(); } };
    window.resetMask = () => { APP.erasedPaths=[]; window.renderLayout(); };
    window.updateRecolorMask = () => { const lCanvas=document.getElementById('layout-canvas'); const url=`url(${lCanvas.toDataURL()})`; document.getElementById('recolor-container').style.setProperty('mask-image',url); document.getElementById('recolor-container').style.setProperty('-webkit-mask-image',url); };

    window.toggleRecolorMode = function() {
        if (APP.isMaskMode) window.toggleMaskMode();
        APP.isRecolorMode = !APP.isRecolorMode;
        const btn=document.getElementById('recolor-toggle-btn'), ctrl=document.getElementById('recolor-controls'), rContainer=document.getElementById('recolor-container');
        if (APP.isRecolorMode) { btn.innerText='EXIT RECOLOR'; btn.classList.add('active'); ctrl.classList.remove('hidden-field'); rContainer.style.pointerEvents='auto'; window.rCanvas.isDrawingMode=true; window.rCanvas.freeDrawingBrush=new fabric.PencilBrush(window.rCanvas); window.updateRecolorBrush(); }
        else { btn.innerText='ENABLE RECOLOR BRUSH'; btn.classList.remove('active'); ctrl.classList.add('hidden-field'); rContainer.style.pointerEvents='none'; window.rCanvas.isDrawingMode=false; const c=document.getElementById('brush-cursor'); if(c) c.style.display='none'; }
    };

    window.updateRecolorBrush = () => { if(window.rCanvas.freeDrawingBrush) { window.rCanvas.freeDrawingBrush.width=parseInt(document.getElementById('recolor-size').value,10); window.rCanvas.freeDrawingBrush.color=document.getElementById('recolor-color').value; window.rCanvas.freeDrawingBrush.strokeLineCap=APP.currentBrushShape; window.rCanvas.freeDrawingBrush.strokeLineJoin=APP.currentBrushShape==='round'?'round':'miter'; window.updateCursorStyle(); } };
    window.undoRecolor  = () => { const objs=window.rCanvas.getObjects(); if(objs.length>0) { window.rCanvas.remove(objs[objs.length-1]); window.rCanvas.renderAll(); } };
    window.resetRecolor = () => { window.rCanvas.clear(); };

    window.addAdvText = () => {
        const t = new fabric.IText("Double Click", { left:APP.canvasW/2, top:APP.canvasH/2, originX:'center', originY:'center', fill:'#ffffff', stroke:'#000000', strokeWidth:2, fontSize:40, fontFamily:'Plus Jakarta Sans' });
        window.canvas.add(t); window.canvas.bringToFront(t); window.canvas.setActiveObject(t); window.canvas.renderAll();
    };

    window.handleSelection = (e) => {
        window.syncTransformUI();
        if (e.selected && e.selected[0].type==='i-text') {
            const obj = e.selected[0];
            document.getElementById('adv-text-tools').classList.remove('hidden-field');
            document.getElementById('adv-font-family').value        = obj.fontFamily||'Plus Jakarta Sans';
            document.getElementById('adv-text-size-in').value       = obj.fontSize||40;
            document.getElementById('adv-text-col').value           = obj.fill||'#ffffff';
            document.getElementById('adv-text-stroke').value        = obj.stroke||'#000000';
            document.getElementById('adv-text-stroke-width').value  = obj.strokeWidth != null ? obj.strokeWidth : 2;
            // Bold / Italic active state
            const boldBtn   = document.getElementById('adv-text-bold-btn');
            const italicBtn = document.getElementById('adv-text-italic-btn');
            if (boldBtn)   boldBtn.style.background   = obj.fontWeight==='bold'   ? 'var(--brand-hover)' : '';
            if (italicBtn) italicBtn.style.background = obj.fontStyle==='italic'  ? 'var(--brand-hover)' : '';
            // Alignment active state
            ['left','center','right'].forEach(align => {
                const btn = document.getElementById('adv-text-align-' + align);
                if (btn) btn.style.background = (obj.textAlign||'left')===align ? 'var(--brand-hover)' : '';
            });
        } else { document.getElementById('adv-text-tools').classList.add('hidden-field'); }
    };
    window.updateAdvTextAttr = (attr, val) => { const obj=window.canvas.getActiveObject(); if(obj) { obj.set(attr,val); window.canvas.requestRenderAll(); if(attr==='fontFamily') setTimeout(()=>window.canvas.requestRenderAll(),150); } };
    window.removeAdvActive   = () => { window.canvas.remove(window.canvas.getActiveObject()); document.getElementById('adv-text-tools').classList.add('hidden-field'); window.canvas.renderAll(); };

    window.changeSize = function() {
        const conf=SIZE_DB[APP.activeSizeKey], col=document.getElementById('canvas-column');
        const isMobile=window.innerWidth<=900;
        const hPad=isMobile?20:80, vPad=isMobile?20:64;
        const mode = APP.canvasSizeMode || 'auto';
        const root = document.getElementById('playmat-tool-root');
        // Large mode: let the editor box grow to fit the canvas — no height cap
        if (mode === 'l') { if (root) root.classList.add('size-mode-large'); }
        else               { if (root) root.classList.remove('size-mode-large'); }
        const measuredW = col.clientWidth - hPad;
        // Defer until the column has been painted and has real dimensions
        if (measuredW <= 0) { requestAnimationFrame(() => window.changeSize()); return; }
        if (mode !== 'l' && col.clientHeight <= 0) { requestAnimationFrame(() => window.changeSize()); return; }
        const aspect = conf.w / conf.h;
        let targetW, targetH;
        if (mode === 'l') {
            targetW = Math.max(measuredW, 250);
            targetH = targetW / aspect;
        } else {
            // Measure the fixed elements that share canvas-column with the canvas
            const infoBar  = document.getElementById('adv-info-bar');
            const infoH    = infoBar  ? (infoBar.offsetHeight  || 40)  : 40;
            const actionsBar = document.getElementById('adv-canvas-actions');
            const actionsH = actionsBar ? (actionsBar.offsetHeight || 120) : 120;
            const maxH = col.clientHeight - vPad - infoH - actionsH - 24; // 16px canvas-wrapper margin-bottom + 8px safety
            if (mode === 'auto') {
                // Auto: fill available width, cap height so nothing overflows
                targetW = Math.max(measuredW, 250);
                targetH = targetW / aspect;
                if (maxH > 100 && targetH > maxH) { targetH = maxH; targetW = targetH * aspect; }
            } else {
                // S = 80% of max-fit height (was M), M = 90% (between old M and L)
                const fracs = { s: 0.80, m: 0.90 };
                targetH = Math.round(maxH * (fracs[mode] || 1));
                targetW = Math.round(targetH * aspect);
                // Cap width to available column width
                if (targetW > measuredW) { targetW = measuredW; targetH = Math.round(targetW / aspect); }
                // Safety cap
                if (maxH > 100 && targetH > maxH) { targetH = maxH; targetW = Math.round(targetH * aspect); }
            }
        }
        APP.canvasW = targetW;
        APP.canvasH = targetH;
        window.canvas.setDimensions({ width:APP.canvasW, height:APP.canvasH });
        window.rCanvas.setDimensions({ width:APP.canvasW, height:APP.canvasH });
        const vCanvas = document.getElementById('vignette-canvas');
        if (vCanvas) { vCanvas.width = APP.canvasW; vCanvas.height = APP.canvasH; }
        document.getElementById('canvas-wrapper').style.width  = APP.canvasW + 'px';
        document.getElementById('canvas-wrapper').style.height = APP.canvasH + 'px';
        window.drawAdvGuides(APP.canvasW, APP.canvasH, conf.w);
        window.forceFit(); if(APP.activeLayoutUrl) window.renderLayout(); window.renderForeground();
        window.updateVignette();
    };

    window.toggleAdvGuides = () => { const g=window.canvas.getObjects().find(o=>o.name==='guides'); if(g) { g.visible=!g.visible; window.canvas.renderAll(); } };

    window.changeRbPoints = function() {
        const isAdv = document.getElementById('adv-backdrop').classList.contains('tab-mode') || document.getElementById('adv-backdrop').style.display==='flex';
        const val   = isAdv ? document.getElementById('rb-points-sel').value : (document.getElementById('s-rb-points-sel')?.value||'none');
        const url   = window.RB_POINTS_DB[val];
        if (!url) { APP.activePointsUrl=null; isAdv?window.renderLayout():window.renderSimpleLayout(); return; }
        if (APP.activePointsUrl !== url) {
            APP.activePointsUrl = url;
            fabric.Image.fromURL(url, (fabricImg, isError) => {
                if (isError) {
                    const fb = new Image();
                    fb.onload = () => { window.rbPointsImg = fb; isAdv ? window.renderLayout() : window.renderSimpleLayout(); };
                    fb.onerror = () => _dbg && console.error('Failed to load points overlay:', url);
                    fb.src = url;
                    return;
                }
                window.rbPointsImg = fabricImg.getElement();
                isAdv ? window.renderLayout() : window.renderSimpleLayout();
            }, { crossOrigin: 'anonymous' });
        } else { isAdv?window.renderLayout():window.renderSimpleLayout(); }
    };

    window.setSolidBackground = (color) => { window.canvas.backgroundColor=String(color); window.canvas.renderAll(); };
    window.clearArtwork = () => { const a=window.canvas.getObjects().find(o=>o.name==='art'); if(a) { window.canvas.remove(a); window.canvas.renderAll(); window.clearAutoFrameBreak(); } };

    window.drawAdvGuides = function(w, h, inches) {
        window.canvas.getObjects().forEach(o => { if(o.name==='guides') window.canvas.remove(o); });
        const ppi=w/inches, bleed=0.25*ppi, safe=0.75*ppi;
        const bleedFrame=new fabric.Path(`M 0 0 H ${w} V ${h} H 0 Z M ${bleed} ${bleed} V ${h-bleed} H ${w-bleed} V ${bleed} Z`,{fill:'rgba(255,0,0,0.25)',selectable:false,evented:false,fillRule:'evenodd'});
        const safeFrame =new fabric.Path(`M ${bleed} ${bleed} H ${w-bleed} V ${h-bleed} H ${bleed} Z M ${safe} ${safe} V ${h-safe} H ${w-safe} V ${safe} Z`,{fill:'rgba(255,255,0,0.15)',selectable:false,evented:false,fillRule:'evenodd'});
        const g=new fabric.Group([bleedFrame,safeFrame],{name:'guides',selectable:false,evented:false});
        window.canvas.add(g); g.bringToFront();
    };

    window.handleUpload = function(input) {
        if (!input.files[0]) return;
        const r = new FileReader();
        r.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (img) => {
                window.resetFilters(); window.checkDPI(img);
                img.set({ name:'art', originX:'center', originY:'center' });
                window.canvas.getObjects().forEach(o => { if(o.name==='art') window.canvas.remove(o); });
                window.canvas.add(img).sendToBack(img);
                window.clearAutoFrameBreak(); window.forceFit(); window.toggleAcc('acc-size', true);
                window.updateBleedWarnings(window.canvas);
            });
        };
        r.readAsDataURL(input.files[0]);
    };

    // --- CUSTOM OVERLAY ---
    window.loadAdvOverlay = function(file) {
        if (!file) return;
        const url = URL.createObjectURL(file);
        fabric.Image.fromURL(url, function(img) {
            window.canvas.getObjects().forEach(o => { if (o.name === 'overlay') window.canvas.remove(o); });
            const scaleX = APP.canvasW / img.width;
            const scaleY = APP.canvasH / img.height;
            img.set({
                name: 'overlay',
                left: APP.canvasW / 2, top: APP.canvasH / 2,
                originX: 'center', originY: 'center',
                scaleX: Math.min(scaleX, scaleY) * 1,
                scaleY: Math.min(scaleX, scaleY) * 1,
                selectable: true, hasControls: true,
            });
            window.canvas.add(img);
            // Place overlay above art but below guides
            const art    = window.canvas.getObjects().find(o => o.name === 'art');
            const guides = window.canvas.getObjects().find(o => o.name === 'guides');
            if (art)    window.canvas.bringForward(img);
            if (guides) window.canvas.bringToFront(guides);
            window.canvas.setActiveObject(img);
            window.canvas.uniformScaling = true;
            window.canvas.renderAll();
            const lockBtn  = document.getElementById('adv-overlay-lock-btn');
            const clearBtn = document.getElementById('adv-overlay-clear-btn');
            if (lockBtn)  { lockBtn.classList.remove('hidden-field'); lockBtn.dataset.locked = 'true'; lockBtn.textContent = '🔒 Proportions Locked'; lockBtn.style.borderColor = ''; lockBtn.style.color = ''; }
            if (clearBtn) clearBtn.classList.remove('hidden-field');
        });
    };

    window.toggleOverlayLock = function() {
        const btn = document.getElementById('adv-overlay-lock-btn');
        if (!btn) return;
        const locked = btn.dataset.locked === 'true';
        if (locked) {
            window.canvas.uniformScaling = false;
            btn.dataset.locked = 'false';
            btn.textContent = '↔ Free Resize';
            btn.style.borderColor = 'var(--brand-hover)';
            btn.style.color = 'var(--brand-hover)';
        } else {
            window.canvas.uniformScaling = true;
            btn.dataset.locked = 'true';
            btn.textContent = '🔒 Proportions Locked';
            btn.style.borderColor = '';
            btn.style.color = '';
        }
    };

    window.clearAdvOverlay = function() {
        window.canvas.getObjects().forEach(o => { if (o.name === 'overlay') window.canvas.remove(o); });
        window.canvas.uniformScaling = true;
        window.canvas.renderAll();
        const lockBtn  = document.getElementById('adv-overlay-lock-btn');
        const clearBtn = document.getElementById('adv-overlay-clear-btn');
        if (lockBtn)  lockBtn.classList.add('hidden-field');
        if (clearBtn) clearBtn.classList.add('hidden-field');
        const inp = document.getElementById('adv-overlay-file-in');
        if (inp) inp.value = '';
    };

    // --- FILTER PRESETS ---
    window.applyFilterPreset = function(name) {
        const presets = {
            vibrant:  { brightness: 0,     contrast: 0.1,  saturation: 0.2,  vibrance: 0.2,  hue: 0,   blur: 0,   shadows: 0,   vignette: 0,  warmth: 0,   grayscale: 0 },
            faded:    { brightness: 0,     contrast: -0.1, saturation: -0.3, vibrance: 0,    hue: 0,   blur: 0,   shadows: 20,  vignette: 15, warmth: 0,   grayscale: 0 },
            velvet:   { brightness: -0.05, contrast: 0.15, saturation: -0.1, vibrance: 0,    hue: 0,   blur: 0,   shadows: -15, vignette: 35, warmth: 10,  grayscale: 0 },
            vintage:  { brightness: -0.05, contrast: 0,    saturation: -0.2, vibrance: 0,    hue: 15,  blur: 0,   shadows: 10,  vignette: 25, warmth: 40,  grayscale: 0 },
            frosted:  { brightness: 0.05,  contrast: -0.05,saturation: -0.2, vibrance: 0,    hue: 10,  blur: 1.5, shadows: 0,   vignette: 0,  warmth: -35, grayscale: 0 },
            golden:   { brightness: 0.05,  contrast: 0.05, saturation: 0.1,  vibrance: 0.15, hue: 0,   blur: 0,   shadows: 15,  vignette: 20, warmth: 65,  grayscale: 0 },
            ink:      { brightness: 0,     contrast: 0.25, saturation: -0.45,vibrance: 0,    hue: 0,   blur: 0,   shadows: -20, vignette: 30, warmth: 0,   grayscale: 0 },
            bw:       { brightness: 0,     contrast: 0.1,  saturation: 0,    vibrance: 0,    hue: 0,   blur: 0,   shadows: 0,   vignette: 0,  warmth: 0,   grayscale: 1 },
            neutral:  { brightness: 0,     contrast: 0,    saturation: 0,    vibrance: 0,    hue: 0,   blur: 0,   shadows: 0,   vignette: 0,  warmth: 0,   grayscale: 0 },
        };
        const p = presets[name]; if (!p) return;
        const map = {
            brightness: 'filter-brightness', contrast:   'filter-contrast',
            saturation: 'filter-saturation', vibrance:   'filter-vibrance',
            hue:        'filter-hue',        blur:       'filter-blur',
            shadows:    'filter-shadows',    vignette:   'filter-vignette',
            warmth:     'filter-warmth',     grayscale:  'filter-grayscale',
        };
        Object.entries(map).forEach(([key, id]) => {
            const el = document.getElementById(id); if (el) el.value = p[key];
        });
        const autoBtn = document.getElementById('auto-opt-btn-adv');
        if (autoBtn) { autoBtn.dataset.active = 'false'; autoBtn.style.background = 'transparent'; autoBtn.style.color = 'var(--brand-hover)'; }
        window.updateFilters();
        window.syncSliderDisplays();
    };

    window.forceFit = function() {
        const img = window.canvas.getObjects().find(o => o.name==='art'); if(!img) return;
        // Use naturalWidth/naturalHeight from the underlying element so EXIF-rotated
        // images (where img.width/height may be swapped or incorrect) scale correctly.
        const el = img.getElement();
        const srcW = (el && el.naturalWidth)  || img.width;
        const srcH = (el && el.naturalHeight) || img.height;
        APP.baseArtScale = Math.max(APP.canvasW/srcW, APP.canvasH/srcH);
        img.scale(APP.baseArtScale).set({ left:APP.canvasW/2, top:APP.canvasH/2, angle:0, flipX:false, flipY:false });
        document.getElementById('zoom-in').value=1; document.getElementById('transform-rotation').value=0; document.getElementById('rotation-val').innerText='0°';
        window.canvas.renderAll(); window.renderForeground();
        window.updateBleedWarnings(window.canvas);
    };

    window.handleZoom = (v) => { const img=window.canvas.getObjects().find(o=>o.name==='art'); if(img&&APP.baseArtScale) { img.scale(APP.baseArtScale*parseFloat(v)); window.canvas.renderAll(); window.renderForeground(); } if(window.canvas) window.updateBleedWarnings(window.canvas); };

    // --- AI FRAME BREAK ---
    window.confirmAutoFrameBreak = () => {
        const art = window.canvas.getObjects().find(o => o.name==='art');
        if (!art) { window.showAppAlert("Missing Artwork", "Please upload artwork first.", "error"); return; }
        document.getElementById('ai-warning-modal').style.display = 'flex';
    };

    window.runAutoFrameBreak = async () => {
        document.getElementById('ai-warning-modal').style.display = 'none';
        const btn = document.getElementById('ai-fb-btn');
        btn.innerHTML = 'UPLOADING...<br><span style="font-size:10px;font-weight:normal;">(Please wait)</span>'; btn.disabled = true;
        try {
            const art   = window.canvas.getObjects().find(o => o.name==='art'); if(!art) throw new Error('No artwork found.');
            const imgEl = art.getElement();
            let targetW = imgEl.naturalWidth||imgEl.width, targetH = imgEl.naturalHeight||imgEl.height;
            const maxPx = 2500000;
            if ((targetW*targetH) > maxPx) { const r=Math.sqrt(maxPx/(targetW*targetH)); targetW=Math.round(targetW*r); targetH=Math.round(targetH*r); }
            const tempC = document.createElement('canvas'); tempC.width=targetW; tempC.height=targetH;
            tempC.getContext('2d').drawImage(imgEl,0,0,targetW,targetH);
            const blob = await new Promise(res => tempC.toBlob(res,'image/jpeg',0.85));

            // FIX 1 in action: uses shared worker upload helper
            const tinyImgUrl = await uploadImageToStaging(blob, 'bg-temp.jpg', 300);
            btn.innerHTML = 'EXTRACTING CHARACTER...<br><span style="font-size:10px;font-weight:normal;">(Can take 15s)</span>';

            const startRes = await fetch(window.CLOUDFLARE_BG_WORKER_URL, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ image: tinyImgUrl })
            });
            if (!startRes.ok) throw new Error('Failed to contact background removal bridge.');
            let prediction = await startRes.json();
            if (prediction.detail || prediction.error || !prediction.id) throw new Error('Internal AI Server Error');

            let attempts = 0;
            while (!['succeeded','failed','canceled'].includes(prediction.status)) {
                if (attempts++ > 30) throw new Error('AI Server timed out.');
                await new Promise(r => setTimeout(r,2000));
                const _u2 = new URL(window.CLOUDFLARE_BG_WORKER_URL); _u2.searchParams.set('id', prediction.id);
                const pollRes = await fetch(_u2);
                if (!pollRes.ok) throw new Error('Failed to poll AI status.');
                prediction = await pollRes.json();
            }
            if (prediction.status !== 'succeeded') throw new Error('AI Cloud processing failed.');

            const fgImg = new Image(); fgImg.crossOrigin='anonymous';
            fgImg.onload = () => {
                APP.aiFgImg = fgImg; window.renderForeground();
                btn.classList.add('hidden-field');
                document.getElementById('ai-fb-clear-btn').classList.remove('hidden-field');
                btn.innerHTML='✨ AUTO FRAME BREAK<br><span style="font-size:10px;font-weight:normal;">(experimental)</span>'; btn.disabled=false;
            };
            fgImg.onerror = () => {
                // onerror fires in a callback — can't throw into the outer try/catch,
                // so handle the failure directly here instead.
                _dbg && console.error('Failed to load extracted foreground image.');
                window.showAppAlert("Frame Break Failed", "The AI extracted the subject but the result could not be loaded. Please try again.", "error");
                btn.innerHTML='✨ AUTO FRAME BREAK<br><span style="font-size:10px;font-weight:normal;">(experimental)</span>'; btn.disabled=false;
            };
            fgImg.src = prediction.output;
        } catch(err) {
            _dbg && console.error(err);
            window.showAppAlert("Frame Break Failed", "An unexpected error occurred. Please try again or contact support.", "error");
            btn.innerHTML='✨ AUTO FRAME BREAK<br><span style="font-size:10px;font-weight:normal;">(experimental)</span>'; btn.disabled=false;
        }
    };

    window.clearAutoFrameBreak = () => {
        APP.aiFgImg = null; window.renderForeground();
        document.getElementById('ai-fb-clear-btn').classList.add('hidden-field');
        document.getElementById('ai-fb-btn').classList.remove('hidden-field');
    };

    window.renderForeground = function() {
        const fgCanvas = document.getElementById('fg-canvas'); if(!fgCanvas) return;
        const ctx = fgCanvas.getContext('2d'), ratio = window.devicePixelRatio||1;
        fgCanvas.width=APP.canvasW*ratio; fgCanvas.height=APP.canvasH*ratio;
        fgCanvas.style.width=APP.canvasW+'px'; fgCanvas.style.height=APP.canvasH+'px';
        ctx.scale(ratio,ratio); ctx.clearRect(0,0,APP.canvasW,APP.canvasH);
        if (!APP.aiFgImg) return;
        const art = window.canvas.getObjects().find(o => o.name==='art');
        if (art) {
            // art.left/top is the centre point (originX/Y = 'center').
            // getScaledWidth/Height() returns the correctly scaled display size.
            // Translate to centre, rotate, flip, then draw centred on that point.
            const w = art.getScaledWidth();
            const h = art.getScaledHeight();
            ctx.save();
            if (art.customFilterStr) ctx.filter = art.customFilterStr;
            ctx.translate(art.left, art.top);
            ctx.rotate(art.angle * Math.PI / 180);
            if (art.flipX) ctx.scale(-1, 1);
            if (art.flipY) ctx.scale(1, -1);
            ctx.drawImage(APP.aiFgImg, -w / 2, -h / 2, w, h);
            ctx.restore();
        }
    };

    window.filterFormats = function() {
        const game=document.getElementById('game-sel').value, activeSize=APP.activeSizeKey==='standard'?'Standard':'Extended';
        const fSel=document.getElementById('format-sel'), hSel=document.getElementById('hand-sel');
        if(game==='Riftbound') document.getElementById('rb-extras-wrap').classList.remove('hidden-field');
        else                   document.getElementById('rb-extras-wrap').classList.add('hidden-field');
        if (!game) { document.getElementById('zone-style-wrap').classList.add('hidden-field'); fSel.classList.add('hidden-field'); hSel.classList.add('hidden-field'); fSel.value=''; hSel.value=''; APP.activeLayoutUrl=null; window.renderLayout(); return; }
        const formats=[...new Set(LAYOUT_RAW.filter(i=>i.game===game&&i.size===activeSize&&i.format!=='').map(i=>i.format))];
        if(game==='Riftbound') { const order=["Bounded","Unbounded","Rubicon Mod","Regional Solo Mod","Gen Con Solo","Houston Regional","Houston Regional w/ Points"]; formats.sort((a,b)=>{ let ia=order.indexOf(a),ib=order.indexOf(b); return (ia===-1?99:ia)-(ib===-1?99:ib); }); }
        fSel.value=''; hSel.value='';
        if (formats.length===0) { fSel.classList.add('hidden-field'); window.filterHands(); }
        else { fSel.classList.remove('hidden-field'); fSel.innerHTML='<option value="">-- Select Format / Style --</option>'; formats.forEach(f=>fSel.innerHTML+=`<option value="${f}">${f}</option>`); hSel.classList.add('hidden-field'); }
    };

    window.filterHands = function() {
        const game=document.getElementById('game-sel').value, format=document.getElementById('format-sel').value, activeSize=APP.activeSizeKey==='standard'?'Standard':'Extended';
        const hSel=document.getElementById('hand-sel');
        const formats=[...new Set(LAYOUT_RAW.filter(i=>i.game===game&&i.size===activeSize&&i.format!=='').map(i=>i.format))];
        if(formats.length>0&&format==='') { hSel.classList.add('hidden-field'); hSel.value=''; APP.activeLayoutUrl=null; window.renderLayout(); return; }
        const hands=[...new Set(LAYOUT_RAW.filter(i=>i.game===game&&i.size===activeSize&&i.format===format&&i.hand!=='').map(i=>i.hand))];
        hSel.value='';
        if(hands.length===0) { hSel.classList.add('hidden-field'); window.applyFinalLayout(); }
        else { hSel.classList.remove('hidden-field'); hSel.innerHTML='<option value="">-- Select Handedness --</option>'; hands.forEach(h=>hSel.innerHTML+=`<option value="${h}">${h}</option>`); }
    };

    window.applyFinalLayout = function() {
        const game=document.getElementById('game-sel').value, format=document.getElementById('format-sel').value, hand=document.getElementById('hand-sel').value, activeSize=APP.activeSizeKey==='standard'?'Standard':'Extended';
        const hands=[...new Set(LAYOUT_RAW.filter(i=>i.game===game&&i.size===activeSize&&i.format===format&&i.hand!=='').map(i=>i.hand))];
        if(hands.length>0&&hand==='') { APP.activeLayoutUrl=null; window.renderLayout(); return; }
        const match=LAYOUT_RAW.find(i=>i.game===game&&i.format===format&&i.hand===hand&&i.size===activeSize);
        if(match) { APP.activeLayoutUrl=match.url ?? ''; APP.erasedPaths=[]; window.resetRecolor(); document.getElementById('zone-style-wrap').classList.remove('hidden-field'); window.renderLayout(); }
    };

    window.updateOpacity = () => { document.getElementById('layout-canvas').style.opacity = document.getElementById('op-in').value; };

    window.renderLayout = function() {
        const mode = document.getElementById('mode-sel').value;
        if (mode==='gradient') {
            const deg=parseInt(document.getElementById('angle-in').value,10)||0;
            document.getElementById('grad-controls').classList.remove('hidden-field');
            document.getElementById('angle-val').innerText=deg+'°';
            document.getElementById('angle-compass').style.transform='rotate('+deg+'deg)';
        } else { document.getElementById('grad-controls').classList.add('hidden-field'); }
        const lCanvas=document.getElementById('layout-canvas'); if(!lCanvas) return; window.updateOpacity();
        // null = no layout selected at all → clear canvas and bail
        // ''   = Points Only format → fall through to drawFn(null) below
        if (APP.activeLayoutUrl === null || APP.activeLayoutUrl === undefined) {
            const ctx=lCanvas.getContext('2d'); ctx.clearRect(0,0,lCanvas.width,lCanvas.height);
            document.getElementById('recolor-container').style.setProperty('mask-image','none');
            document.getElementById('recolor-container').style.setProperty('-webkit-mask-image','none'); return;
        }
        const isRiftbound=document.getElementById('game-sel').value==='Riftbound';
        const rbPointsVal=isRiftbound?document.getElementById('rb-points-sel').value:'none';
        const hand=document.getElementById('hand-sel').value, format=document.getElementById('format-sel').value;

        const drawFn = (img) => window.drawLayoutCanvasCore(lCanvas.getContext('2d'), img, lCanvas, document.getElementById('col-1').value, mode, true, isRiftbound, rbPointsVal, hand, format);
        // Points Only format has an empty URL — draw with null image (points strip only)
        if (APP.activeLayoutUrl === '') { drawFn(null); return; }
        if (APP.cachedLayoutUrl===APP.activeLayoutUrl && APP.cachedLayoutImg) { drawFn(APP.cachedLayoutImg); }
        else {
            fabric.Image.fromURL(APP.activeLayoutUrl, (fabricImg, isError) => {
                if (isError) {
                    // CORS failed — retry without crossOrigin (recolor mask will be unavailable)
                    _dbg && console.warn('Layout image CORS load failed, retrying without crossOrigin:', APP.activeLayoutUrl);
                    const fallbackImg = new Image();
                    fallbackImg.onload = () => { APP.cachedLayoutImg = fallbackImg; APP.cachedLayoutUrl = APP.activeLayoutUrl; drawFn(fallbackImg); };
                    fallbackImg.onerror = () => { _dbg && console.error('Failed to load layout image:', APP.activeLayoutUrl); window.showAppAlert("Zone Failed to Load", "The game zone image could not be loaded. Please check your R2 bucket has CORS enabled, or try again.", "error"); };
                    fallbackImg.src = APP.activeLayoutUrl;
                    return;
                }
                const img = fabricImg.getElement();
                APP.cachedLayoutImg = img; APP.cachedLayoutUrl = APP.activeLayoutUrl;
                drawFn(img);
            }, { crossOrigin: 'anonymous' });
        }
    };

    // FIX 4 in action: drawLayoutCanvasCore now delegates to shared helpers
    window.drawLayoutCanvasCore = function(ctx, img, lCanvas, c1, mode, isAdv, isRiftbound, rbPointsVal, hand, format) {
        // Points Only: img will be null — pass a blank 1x1 image so the rest of the
        // pipeline (points draw, source-in fill) still runs correctly.
        if (!img) { img = document.createElement('canvas'); img.width = 1; img.height = 1; }
        const ratio=window.devicePixelRatio||1;
        lCanvas.width=APP.canvasW*ratio; lCanvas.height=APP.canvasH*ratio;
        lCanvas.style.width=APP.canvasW+'px'; lCanvas.style.height=APP.canvasH+'px';
        ctx.scale(ratio,ratio); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
        ctx.clearRect(0,0,APP.canvasW,APP.canvasH); ctx.globalAlpha=1.0; ctx.globalCompositeOperation='source-over';

        if (isRiftbound) {
            // Clip to safe area in CSS pixel space (after ratio scale).
            // Safe inset = 225 native units; s converts native→CSS pixels.
            const nativeW = Math.round(SIZE_DB[APP.activeSizeKey]?.w * 300) || Math.round(24.5 * 300);
        const s = APP.canvasW / nativeW;
            const sx = 225*s, sy = 225*s, sw = 6900*s, sh = 3900*s;
            ctx.save();
            ctx.beginPath();
            ctx.rect(sx, sy, sw, sh);
            ctx.clip();
            drawRiftboundLayout(ctx, img, APP.canvasW, APP.canvasH, hand, format, rbPointsVal);
            ctx.globalCompositeOperation = 'source-in';
            applyGradientOrSolidFill(ctx, APP.canvasW, APP.canvasH, isAdv ? mode : 'solid', c1);
            ctx.restore();
        } else {
            ctx.drawImage(img, 0, 0, APP.canvasW, APP.canvasH);
            ctx.globalCompositeOperation = 'source-in';
            applyGradientOrSolidFill(ctx, APP.canvasW, APP.canvasH, isAdv ? mode : 'solid', c1);
        }

        if (isAdv && APP.erasedPaths.length>0) {
            ctx.globalCompositeOperation='destination-out';
            APP.erasedPaths.forEach(path => {
                ctx.lineWidth=path.size; ctx.lineCap=path.shape; ctx.lineJoin=path.shape==='round'?'round':'miter';
                ctx.beginPath(); ctx.moveTo(path.points[0].x,path.points[0].y);
                path.points.forEach(pt=>ctx.lineTo(pt.x,pt.y)); ctx.stroke();
            });
        }
        if (isAdv) window.updateRecolorMask(); else ctx.globalCompositeOperation='source-over';
    };


    // Injects 300 DPI metadata into a JPEG blob so it opens correctly in
    // Photoshop, Photopea, Windows Explorer, etc.
    // Strategy: always prepend a fresh JFIF APP0 segment with DPI=300 right
    // after the SOI marker, replacing any existing APP0/APP1 density info.
    async function injectJpegDpi(blob, dpi) {
        const buf   = await blob.arrayBuffer();
        const src   = new Uint8Array(buf);
        if (src[0] !== 0xFF || src[1] !== 0xD8) return blob; // not a valid JPEG

        // Build a 18-byte JFIF APP0 segment with the desired DPI
        // FF E0 | len=0x0010 | "JFIF\0" | ver=1.1 | units=1(inch) | Xdpi | Ydpi | 0 0
        const app0 = new Uint8Array([
            0xFF, 0xE0,               // APP0 marker
            0x00, 0x10,               // segment length = 16
            0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
            0x01, 0x01,               // version 1.1
            0x01,                     // units: 1 = dots per inch
            (dpi >> 8) & 0xFF, dpi & 0xFF, // Xdensity
            (dpi >> 8) & 0xFF, dpi & 0xFF, // Ydensity
            0x00, 0x00               // no thumbnail
        ]);

        // Skip the SOI (FF D8), then skip any existing APP0 (FF E0) or APP1 (FF E1)
        // segments so we don't stack multiple conflicting density markers.
        let skip = 2;
        while (skip < src.length - 3) {
            if (src[skip] !== 0xFF) break;
            const m = src[skip + 1];
            if (m !== 0xE0 && m !== 0xE1) break; // stop at first non-APP segment
            const segLen = (src[skip + 2] << 8) | src[skip + 3];
            skip += 2 + segLen;
        }

        // Reassemble: SOI + new APP0 + remainder (skipping old APP0/APP1)
        const out = new Uint8Array(2 + app0.length + (src.length - skip));
        out.set(src.slice(0, 2));          // FF D8
        out.set(app0, 2);                  // new JFIF APP0
        out.set(src.slice(skip), 2 + app0.length); // rest of original JPEG
        return new Blob([out], { type: 'image/jpeg' });
    }

    async function buildPrintCanvas(isAdv, activeCanvas) {
        const sizeSel   = APP.activeSizeKey||'standard';
        const dpi       = 300;
        const printW    = Math.round(SIZE_DB[sizeSel].w * dpi);
        const printH    = Math.round(SIZE_DB[sizeSel].h * dpi);
        const scale     = printW / APP.canvasW;

        const layoutImg   = isAdv ? APP.cachedLayoutImg : APP.s_cachedLayoutImg;
        const layoutColor = isAdv ? document.getElementById('col-1').value : (document.getElementById('s-col')?.value||'#ffffff');
        const gameVal     = isAdv ? document.getElementById('game-sel').value   : (document.getElementById('s-game-sel')?.value||'None');
        const handVal     = isAdv ? document.getElementById('hand-sel').value   : (document.getElementById('s-hand-sel')?.value||'N/A');
        const formatVal   = isAdv ? document.getElementById('format-sel').value : (document.getElementById('s-format-sel')?.value||'N/A');
        const isRiftbound = gameVal==='Riftbound';
        const rbPointsVal = isRiftbound ? (isAdv ? document.getElementById('rb-points-sel').value : (document.getElementById('s-rb-points-sel')?.value||'none')) : 'none';

        // Hide guides temporarily
        const g=activeCanvas.getObjects().find(o=>o.name==='guides'), wasVisible=g?g.visible:false;
        if(g) g.visible=false; activeCanvas.renderAll();

        const mCanvas=document.createElement('canvas'); mCanvas.width=printW; mCanvas.height=printH;
        const mCtx=mCanvas.getContext('2d');
        if(!mCtx) throw new Error('Memory error: Please try from a desktop computer.');
        mCtx.imageSmoothingEnabled=true; mCtx.imageSmoothingQuality='high';
        if(activeCanvas.backgroundColor) { mCtx.fillStyle=activeCanvas.backgroundColor; mCtx.fillRect(0,0,printW,printH); }

        // Draw artwork at print resolution — direct pixel draw bypasses Fabric's
        // setZoom() crop bug: setZoom shifts the viewport but object left/top
        // coordinates stay in display-pixel space, so the art anchors to the
        // top-left of the print canvas instead of centering correctly.
        const origW = activeCanvas.width, origH = activeCanvas.height, origZoom = activeCanvas.getZoom();
        const art = activeCanvas.getObjects().find(o => o.name === 'art');
        if (art) {
            const el = art.getElement();
            const w  = art.getScaledWidth()  * scale;
            const h  = art.getScaledHeight() * scale;
            const cx = art.left * scale;
            const cy = art.top  * scale;
            mCtx.save();
            if (art.customFilterStr) mCtx.filter = art.customFilterStr;
            mCtx.translate(cx, cy);
            mCtx.rotate(art.angle * Math.PI / 180);
            if (art.flipX) mCtx.scale(-1, 1);
            if (art.flipY) mCtx.scale(1, -1);
            mCtx.drawImage(el, -w/2, -h/2, w, h);
            mCtx.restore();
        }

        // Advanced editor: composite non-art objects (text layers, shapes) at print
        // resolution on top of the direct-drawn art. Art is hidden for this pass and
        // the canvas background is cleared so only non-transparent pixels (text etc.)
        // land on mCtx without obscuring the art underneath.
        if (isAdv) {
            if (art) art.visible = false;
            const savedBg = activeCanvas.backgroundColor;
            activeCanvas.backgroundColor = '';
            activeCanvas.setDimensions({width:printW,height:printH}); activeCanvas.setZoom(scale); activeCanvas.renderAll();
            mCtx.drawImage(activeCanvas.getElement(), 0, 0);
            activeCanvas.backgroundColor = savedBg;
            activeCanvas.setDimensions({width:origW,height:origH}); activeCanvas.setZoom(origZoom);
            if (art) { art.visible = true; activeCanvas.renderAll(); }
        }

        // Draw layout overlay — only if the user has actively selected a layout in this session.
        // Guard against stale cachedLayoutImg persisting from a previous session without restart.
        const activeUrl = isAdv ? APP.activeLayoutUrl : APP.s_activeLayoutUrl;
        if (layoutImg && activeUrl !== null && activeUrl !== undefined) {
            const tCanvas=document.createElement('canvas'); tCanvas.width=printW; tCanvas.height=printH;
            const tCtx=tCanvas.getContext('2d');
            if (isRiftbound) {
                // Clip to safe area in print pixel space.
                // At 300dpi: safe inset = 225px (0.75" × 300).
                // Scale factor: printW maps to the product's native canvas width.
                const nativePrintW = Math.round(SIZE_DB[sizeSel]?.w * 300) || Math.round(24.5 * 300);
                const ps = printW / nativePrintW;
                const px = 225*ps, py = 225*ps, pw = 6900*ps, ph = 3900*ps;
                tCtx.save();
                tCtx.rect(px, py, pw, ph);
                tCtx.clip();
                drawRiftboundLayout(tCtx, layoutImg, printW, printH, handVal, formatVal, rbPointsVal);
                tCtx.globalCompositeOperation='source-in';
                const fillMode = isAdv ? document.getElementById('mode-sel').value : 'solid';
                applyGradientOrSolidFill(tCtx, printW, printH, fillMode, layoutColor);
                tCtx.restore();
            } else {
                tCtx.drawImage(layoutImg,0,0,printW,printH);
                tCtx.globalCompositeOperation='source-in';
                const fillMode = isAdv ? document.getElementById('mode-sel').value : 'solid';
                applyGradientOrSolidFill(tCtx, printW, printH, fillMode, layoutColor);
            }

            if (isAdv && APP.erasedPaths.length>0) {
                tCtx.globalCompositeOperation='destination-out';
                APP.erasedPaths.forEach(path => {
                    tCtx.lineWidth=path.size*scale; tCtx.lineCap=path.shape; tCtx.lineJoin=path.shape==='round'?'round':'miter';
                    tCtx.beginPath(); tCtx.moveTo(path.points[0].x*scale,path.points[0].y*scale);
                    path.points.forEach(pt=>tCtx.lineTo(pt.x*scale,pt.y*scale)); tCtx.stroke();
                });
            }
            mCtx.save(); mCtx.globalAlpha=isAdv?(document.getElementById('op-in').value||1.0):1.0;
            mCtx.drawImage(tCanvas,0,0,printW,printH); mCtx.restore();
        }

        // Draw recolor layer
        if (isAdv && window.rCanvas) {
            window.rCanvas.setDimensions({width:printW,height:printH}); window.rCanvas.setZoom(scale); window.rCanvas.renderAll();
            mCtx.drawImage(window.rCanvas.getElement(),0,0);
            window.rCanvas.setDimensions({width:origW,height:origH}); window.rCanvas.setZoom(origZoom);
        }

        // Draw AI foreground layer at print resolution.
        // Mirror renderForeground: use getScaledWidth/Height scaled to print res,
        // centred on art.left/top (which is the centre point, originX/Y = 'center').
        if (isAdv && APP.aiFgImg) {
            const art=activeCanvas.getObjects().find(o=>o.name==='art');
            if(art) {
                const w = art.getScaledWidth()  * scale;
                const h = art.getScaledHeight() * scale;
                const cx = art.left * scale;
                const cy = art.top  * scale;
                mCtx.save();
                if(art.customFilterStr) mCtx.filter=art.customFilterStr;
                mCtx.translate(cx, cy);
                mCtx.rotate(art.angle*Math.PI/180);
                if(art.flipX) mCtx.scale(-1,1);
                if(art.flipY) mCtx.scale(1,-1);
                mCtx.drawImage(APP.aiFgImg, -w/2, -h/2, w, h);
                mCtx.restore();
            }
        }

        // Draw vignette overlay at print resolution
        if (isAdv) {
            const vigStrength = parseFloat(document.getElementById('filter-vignette')?.value || 0);
            if (vigStrength > 0) {
                const alpha = vigStrength / 100;
                const grad = mCtx.createRadialGradient(printW/2, printH/2, 0, printW/2, printH/2, Math.max(printW, printH) * 0.7);
                grad.addColorStop(0,   'rgba(0,0,0,0)');
                grad.addColorStop(0.5, `rgba(0,0,0,${(alpha * 0.3).toFixed(3)})`);
                grad.addColorStop(1,   `rgba(0,0,0,${(alpha * 0.95).toFixed(3)})`);
                mCtx.fillStyle = grad;
                mCtx.fillRect(0, 0, printW, printH);
            }
        }

        if(g) g.visible=wasVisible; activeCanvas.renderAll();

        return new Promise((resolve,reject) => {
            mCanvas.toBlob(async b => {
                if (!b) { reject(new Error('Canvas export failed.')); return; }
                try { resolve(await injectJpegDpi(b, 300)); }
                catch(e) { resolve(b); } // if injection fails, fall back to original blob
            },'image/jpeg',0.98);
        });
    }


    // --- COLOR SYNC HELPERS (hex input ↔ color picker) ---
    window.syncHex = function(pickerId, hexId) {
        const picker = document.getElementById(pickerId);
        const hex    = document.getElementById(hexId);
        if (picker && hex) hex.value = picker.value;
    };

    window.syncColor = function(hexId, pickerId) {
        const hex    = document.getElementById(hexId);
        const picker = document.getElementById(pickerId);
        if (!hex || !picker) return;
        const val = hex.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) picker.value = val;
    };

    window.hexToRgba = function(hex, alpha) {
        const r = parseInt(hex.slice(1,3),16);
        const g = parseInt(hex.slice(3,5),16);
        const b = parseInt(hex.slice(5,7),16);
        return `rgba(${r},${g},${b},${alpha})`;
    };

    // --- BRUSH CURSOR STYLE ---
    window.updateCursorStyle = function() {
        const cursor = document.getElementById('brush-cursor');
        if (!cursor) return;
        const isRecolor = APP.isRecolorMode;
        const size = parseInt(document.getElementById(isRecolor ? 'recolor-size' : 'brush-size')?.value || 40, 10);
        const scaled = size * APP.currentZoom;
        cursor.style.width        = scaled + 'px';
        cursor.style.height       = scaled + 'px';
        cursor.style.borderRadius = APP.currentBrushShape === 'round' ? '50%' : '0';
    };

    // --- SIMPLE EDITOR LAYOUT DROPDOWNS ---
    window.filterSimpleFormats = function() {
        const game       = document.getElementById('s-game-sel').value;
        const activeSize = APP.activeSizeKey === 'standard' ? 'Standard' : APP.activeSizeKey === 'extended' ? 'Extended' : APP.activeSizeKey;
        const fSel       = document.getElementById('s-format-sel');
        const hSel       = document.getElementById('s-hand-sel');
        const colorWrap  = document.getElementById('s-color-wrap');

        const rbExtras = document.getElementById('s-rb-extras-wrap');
        if (rbExtras) {
            if (game === 'Riftbound') rbExtras.classList.remove('hidden-field');
            else                      rbExtras.classList.add('hidden-field');
        }

        if (!game) {
            fSel.classList.add('hidden-field'); hSel.classList.add('hidden-field');
            if (colorWrap) colorWrap.classList.add('hidden-field');
            fSel.value = ''; hSel.value = '';
            APP.s_activeLayoutUrl = null; window.renderSimpleLayout(); return;
        }

        const formats = [...new Set(LAYOUT_RAW.filter(i => i.game===game && i.size===activeSize && i.format!=='').map(i => i.format))];
        fSel.value = ''; hSel.value = '';
        if (formats.length === 0) { fSel.classList.add('hidden-field'); window.filterSimpleHands(); }
        else {
            fSel.classList.remove('hidden-field');
            fSel.innerHTML = '<option value="">-- Select Format / Style --</option>';
            formats.forEach(f => fSel.innerHTML += `<option value="${f}">${f}</option>`);
            hSel.classList.add('hidden-field');
        }
    };

    window.filterSimpleHands = function() {
        const game       = document.getElementById('s-game-sel').value;
        const format     = document.getElementById('s-format-sel').value;
        const activeSize = APP.activeSizeKey === 'standard' ? 'Standard' : APP.activeSizeKey === 'extended' ? 'Extended' : APP.activeSizeKey;
        const hSel       = document.getElementById('s-hand-sel');
        const colorWrap  = document.getElementById('s-color-wrap');

        const formats = [...new Set(LAYOUT_RAW.filter(i => i.game===game && i.size===activeSize && i.format!=='').map(i => i.format))];
        if (formats.length > 0 && format === '') {
            hSel.classList.add('hidden-field'); hSel.value = '';
            APP.s_activeLayoutUrl = null; window.renderSimpleLayout(); return;
        }

        const hands = [...new Set(LAYOUT_RAW.filter(i => i.game===game && i.size===activeSize && i.format===format && i.hand!=='').map(i => i.hand))];
        hSel.value = '';
        if (hands.length === 0) { hSel.classList.add('hidden-field'); window.applySimpleLayout(); }
        else {
            hSel.classList.remove('hidden-field');
            hSel.innerHTML = '<option value="">-- Select Handedness --</option>';
            hands.forEach(h => hSel.innerHTML += `<option value="${h}">${h}</option>`);
        }
    };

    window.applySimpleLayout = function() {
        const game       = document.getElementById('s-game-sel').value;
        const format     = document.getElementById('s-format-sel').value;
        const hand       = document.getElementById('s-hand-sel').value;
        const activeSize = APP.activeSizeKey === 'standard' ? 'Standard' : APP.activeSizeKey === 'extended' ? 'Extended' : APP.activeSizeKey;
        const colorWrap  = document.getElementById('s-color-wrap');

        const hands = [...new Set(LAYOUT_RAW.filter(i => i.game===game && i.size===activeSize && i.format===format && i.hand!=='').map(i => i.hand))];
        if (hands.length > 0 && hand === '') { APP.s_activeLayoutUrl = null; window.renderSimpleLayout(); return; }

        const match = LAYOUT_RAW.find(i => i.game===game && i.format===format && i.hand===hand && i.size===activeSize);
        if (match) {
            APP.s_activeLayoutUrl = match.url ?? '';
            if (colorWrap) colorWrap.classList.remove('hidden-field');
            window.renderSimpleLayout();
        }
    };

    window.renderSimpleLayout = function() {
        const lCanvas = document.getElementById('s-layout-canvas'); if (!lCanvas) return;
        if (APP.s_activeLayoutUrl === null || APP.s_activeLayoutUrl === undefined) {
            const ctx = lCanvas.getContext('2d'); ctx.clearRect(0, 0, lCanvas.width, lCanvas.height); return;
        }
        const isRiftbound = document.getElementById('s-game-sel').value === 'Riftbound';
        const rbPointsVal = isRiftbound ? (document.getElementById('s-rb-points-sel')?.value || 'none') : 'none';
        const hand        = document.getElementById('s-hand-sel').value;
        const format      = document.getElementById('s-format-sel').value;
        const c1          = document.getElementById('s-col')?.value || '#ffffff';

        const drawFn = (img) => {
            APP.s_cachedLayoutImg = img;
            window.drawLayoutCanvasCore(lCanvas.getContext('2d'), img, lCanvas, c1, 'solid', false, isRiftbound, rbPointsVal, hand, format);
        };

        // Points Only: empty URL — draw with null so only the points strip renders
        if (APP.s_activeLayoutUrl === '') { drawFn(null); return; }

        if (APP.s_cachedLayoutImg && APP.s_activeLayoutUrl === lCanvas.dataset.lastUrl) {
            drawFn(APP.s_cachedLayoutImg);
        } else {
            fabric.Image.fromURL(APP.s_activeLayoutUrl, (fabricImg, isError) => {
                if (isError) {
                    // CORS failed — retry without crossOrigin
                    _dbg && console.warn('Simple layout image CORS load failed, retrying without crossOrigin:', APP.s_activeLayoutUrl);
                    const fallbackImg = new Image();
                    fallbackImg.onload = () => { APP.s_cachedLayoutImg = fallbackImg; lCanvas.dataset.lastUrl = APP.s_activeLayoutUrl; drawFn(fallbackImg); };
                    fallbackImg.onerror = () => { _dbg && console.error('Failed to load simple layout image:', APP.s_activeLayoutUrl); window.showAppAlert("Zone Failed to Load", "The game zone image could not be loaded. Please check your R2 bucket has CORS enabled, or try again.", "error"); };
                    fallbackImg.src = APP.s_activeLayoutUrl;
                    return;
                }
                const img = fabricImg.getElement();
                lCanvas.dataset.lastUrl = APP.s_activeLayoutUrl;
                drawFn(img);
            }, { crossOrigin: 'anonymous' });
        }
    };

    // --- SIMPLE EDITOR SELECTION HANDLER ---
    window.handleSimpleSelection = function(e) {
        // Simple editor has no text tools panel — nothing to sync
    };

    // ============================================================
    // DOWNLOAD (replaces Add to Cart)
    // ============================================================
    window.downloadDesign = async function(mode) {
        var isAdv        = (mode === 'adv');
        var btn          = isAdv ? document.getElementById('sidebar-atc') : document.getElementById('simple-atc');
        var activeCanvas = isAdv ? window.canvas : window.sCanvas;

        if (!activeCanvas.getObjects().find(function(o){ return o.name === 'art'; }) && !activeCanvas.backgroundColor) {
            window.showAppAlert("Missing Artwork", "Please upload artwork before downloading.", "error");
            return;
        }

        if (!window.checkArtCoverage(activeCanvas)) {
            APP._bleedConfirmCallback = function() { window._executeDownload(mode, btn, activeCanvas); };
            document.getElementById('bleed-confirm-modal').style.display = 'flex';
            return;
        }

        await window._executeDownload(mode, btn, activeCanvas);
    };

    window._executeDownload = async function(mode, btn, activeCanvas) {
        var isAdv    = (mode === 'adv');
        var origText = btn.innerText;
        btn.innerText = 'PREPARING...'; btn.disabled = true;
        try {
            var blob     = await buildPrintCanvas(isAdv, activeCanvas);
            var filename = window.buildPrintFilename();
            var url      = URL.createObjectURL(blob);
            var a        = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            btn.innerText = 'DOWNLOADED! ✓'; btn.style.background = 'var(--success-green)';
            setTimeout(function() {
                btn.innerText = 'DOWNLOAD';
                btn.style.background = 'var(--brand-primary)';
                btn.disabled = false;
            }, 2500);
        } catch(err) {
            _dbg && console.error(err);
            window.showAppAlert("Download Error", err.message || "An error occurred. Please try again.", "error");
            btn.innerText = origText; btn.style.background = 'var(--brand-primary)'; btn.disabled = false;
        }
    };

    // ============================================================
    // BATCH ENHANCE MODE
    // ============================================================
    var _batch = { results: [] };

    // ── TAB NAVIGATION ──────────────────────────────────────────
    window.switchTab = function(tabId) {
        var rabd    = document.getElementById('adv-backdrop');
        var aePanel = document.getElementById('tab-panel-adv-editor');
        var dvw     = document.getElementById('designer-visibility-wrapper');

        // Restore adv-backdrop if leaving adv-editor
        if (rabd.classList.contains('tab-mode') && tabId !== 'adv-editor') {
            rabd.classList.remove('tab-mode');
            rabd.style.display = 'none';
            if (dvw) dvw.appendChild(rabd);
        }

        document.querySelectorAll('.tool-tab-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.tab === tabId);
        });
        document.querySelectorAll('.tool-tab-panel').forEach(function(p) {
            p.classList.remove('active');
        });
        var panel = document.getElementById('tab-panel-' + tabId);
        if (panel) panel.classList.add('active');

        // Playmat Studio: move adv-backdrop into tab panel and show inline
        if (tabId === 'adv-editor') {
            aePanel.appendChild(rabd);
            rabd.classList.add('tab-mode');
            rabd.style.display = 'block';
            requestAnimationFrame(function() {
                window.initCanvas();
                window.updateInfoBars(null);
                window.populateGameDropdowns();
            });
            return;
        }
    };

    window.openBatchMode = function() { window.switchTab('batch'); };
    window.closeBatchMode = function() { /* tools now live in tabs — no overlay to close */ };

    window.clearBatch = function() {
        _batch.results = [];
        document.getElementById('batch-preview-grid').innerHTML = '';
        document.getElementById('batch-controls').style.display = 'none';
        document.getElementById('batch-status').style.display = 'none';
        document.getElementById('batch-file-in').value = '';
    };

    window.handleBatchFiles = async function(files) {
        if (!files || files.length === 0) return;
        var statusEl = document.getElementById('batch-status');
        var gridEl   = document.getElementById('batch-preview-grid');
        statusEl.style.display = 'block';
        statusEl.textContent   = 'Processing 0 / ' + files.length + '...';

        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            statusEl.textContent = 'Processing ' + (i + 1) + ' / ' + files.length + ': ' + file.name;
            try {
                var blob     = await window._applyBatchEnhancement(file);
                var baseName = file.name.replace(/\.[^.]+$/, '');
                var outName  = baseName + '-enhanced.jpg';
                var thumbUrl = URL.createObjectURL(blob);
                var idx      = _batch.results.length;
                _batch.results.push({ name: outName, blob: blob, thumbUrl: thumbUrl });

                var card = document.createElement('div');
                card.style.cssText = 'background:rgba(0,0,0,0.3);border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);text-align:center;';
                card.innerHTML =
                    '<img src="' + thumbUrl + '" style="width:100%;height:100px;object-fit:cover;display:block;">' +
                    '<div style="padding:6px 6px 2px;font-size:10px;color:var(--brand-text-sec);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(outName) + '">' + escHtml(outName) + '</div>' +
                    '<div style="padding:2px 6px 6px;display:flex;justify-content:space-between;align-items:center;">' +
                    '<span style="font-size:10px;color:var(--success-green);font-weight:bold;">✓ ENHANCED</span>' +
                    '<button data-dl-idx="' + idx + '" style="background:none;border:none;color:var(--brand-hover);cursor:pointer;font-size:15px;padding:2px 4px;line-height:1;" title="Download this file">⬇</button>' +
                    '</div>';
                gridEl.appendChild(card);
            } catch(err) {
                _dbg && console.error('Batch error for', file.name, err);
                var errCard = document.createElement('div');
                errCard.style.cssText = 'background:rgba(255,71,87,0.15);border-radius:6px;padding:10px;border:1px solid rgba(255,71,87,0.3);text-align:center;';
                errCard.innerHTML = '<div style="font-size:10px;color:var(--danger-red);">✗ ' + escHtml(file.name) + '<br>Failed</div>';
                gridEl.appendChild(errCard);
            }
        }

        statusEl.textContent = 'Done! ' + _batch.results.length + ' image(s) ready.';
        if (_batch.results.length > 0) {
            var dlBtn = document.getElementById('batch-download-btn');
            if (_batch.results.length === 1) {
                dlBtn.textContent = '⬇ DOWNLOAD';
                dlBtn.onclick = function() { window.downloadBatchSingle(0); };
            } else {
                dlBtn.textContent = '⬇ DOWNLOAD ALL AS ZIP';
                dlBtn.onclick = window.downloadBatchZip;
            }
            document.getElementById('batch-controls').style.display = 'block';
        }
    };

    window._applyBatchEnhancement = function(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var img = new Image();
                img.onload = function() {
                    var c    = document.createElement('canvas');
                    c.width  = img.naturalWidth  || img.width;
                    c.height = img.naturalHeight || img.height;
                    var ctx  = c.getContext('2d');
                    ctx.filter = 'brightness(112%) contrast(108%) saturate(107%)';
                    ctx.drawImage(img, 0, 0);
                    c.toBlob(function(b) {
                        if (b) resolve(b); else reject(new Error('Canvas export failed'));
                    }, 'image/jpeg', 0.99);
                };
                img.onerror = function() { reject(new Error('Failed to load image')); };
                img.src = e.target.result;
            };
            reader.onerror = function() { reject(new Error('Failed to read file')); };
            reader.readAsDataURL(file);
        });
    };

    window.downloadBatchSingle = function(idx) {
        var r = _batch.results[idx];
        if (!r) return;
        var url = URL.createObjectURL(r.blob);
        var a   = document.createElement('a');
        a.href = url; a.download = r.name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    window.downloadBatchZip = async function() {
        if (_batch.results.length === 0) return;
        var btn = document.getElementById('batch-download-btn');
        var origLabel = btn.textContent;
        btn.textContent = 'ZIPPING...'; btn.disabled = true;
        try {
            var zip = new JSZip();
            _batch.results.forEach(function(r) { zip.file(r.name, r.blob); });
            var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
            var url = URL.createObjectURL(zipBlob);
            var a   = document.createElement('a');
            a.href = url; a.download = 'playmat-enhanced-' + Date.now() + '.zip';
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            btn.textContent = 'DOWNLOADED! ✓'; btn.style.background = 'var(--success-green)';
            setTimeout(function() { btn.textContent = origLabel; btn.style.background = ''; btn.disabled = false; }, 2500);
        } catch(err) {
            _dbg && console.error(err);
            window.showAppAlert("ZIP Error", "Failed to create ZIP. Please try again.", "error");
            btn.textContent = origLabel; btn.disabled = false;
        }
    };

    // ============================================================
    // FORMAT CONVERTER MODE
    // ============================================================
    var _converter = { results: [] };

    window.openConverterMode = function() { window.switchTab('converter'); };
    window.closeConverterMode = function() { /* tools now live in tabs — no overlay to close */ };

    window.clearConverter = function() {
        _converter.results = [];
        document.getElementById('converter-preview-grid').innerHTML = '';
        document.getElementById('converter-controls').style.display = 'none';
        document.getElementById('converter-status').style.display = 'none';
        document.getElementById('converter-file-in').value = '';
    };

    // Maps format value -> { mimeType, quality, ext, label }
    var _fmtMap = {
        'jpeg': { mimeType: 'image/jpeg', quality: 0.99, ext: 'jpg',  label: 'JPG'  },
        'png':  { mimeType: 'image/png',  quality: 1.0,  ext: 'png',  label: 'PNG'  },
        'webp': { mimeType: 'image/webp', quality: 0.95, ext: 'webp', label: 'WEBP' }
    };

    window.handleConverterFiles = async function(files) {
        if (!files || files.length === 0) return;
        var fmtKey   = (document.getElementById('converter-format-sel') || {}).value || 'jpeg';
        var fmt      = _fmtMap[fmtKey] || _fmtMap['jpeg'];
        var statusEl = document.getElementById('converter-status');
        var gridEl   = document.getElementById('converter-preview-grid');
        statusEl.style.display = 'block';
        statusEl.textContent   = 'Converting 0 / ' + files.length + '...';

        for (var i = 0; i < files.length; i++) {
            var file    = files[i];
            var origExt = (file.name.split('.').pop() || 'IMG').toUpperCase();
            statusEl.textContent = 'Converting ' + (i + 1) + ' / ' + files.length + ': ' + file.name;
            try {
                var blob     = await window._convertFile(file, fmt.mimeType, fmt.quality);
                var base     = file.name.replace(/\.[^.]+$/, '');
                var outName  = base + '.' + fmt.ext;
                var thumbUrl = URL.createObjectURL(blob);
                _converter.results.push({ name: outName, blob: blob, thumbUrl: thumbUrl });

                var card = document.createElement('div');
                card.style.cssText = 'background:rgba(0,0,0,0.3);border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);text-align:center;';
                card.innerHTML =
                    '<img src="' + thumbUrl + '" style="width:100%;height:100px;object-fit:cover;display:block;">' +
                    '<div style="padding:6px 6px 2px;font-size:10px;color:var(--brand-text-sec);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(outName) + '">' + escHtml(outName) + '</div>' +
                    '<div style="padding:2px 6px 6px;display:flex;justify-content:center;gap:4px;align-items:center;">' +
                    '<span style="font-size:9px;background:rgba(255,255,255,0.15);padding:2px 5px;border-radius:3px;color:var(--brand-text-sec);">' + escHtml(origExt) + '</span>' +
                    '<span style="font-size:9px;color:var(--brand-text-sec);">&#x2192;</span>' +
                    '<span style="font-size:9px;background:var(--brand-primary);padding:2px 5px;border-radius:3px;color:#fff;font-weight:bold;">' + fmt.label + '</span>' +
                    '</div>';
                gridEl.appendChild(card);
            } catch(err) {
                _dbg && console.error('Converter error for', file.name, err);
                var errCard = document.createElement('div');
                errCard.style.cssText = 'background:rgba(255,71,87,0.15);border-radius:6px;padding:10px;border:1px solid rgba(255,71,87,0.3);text-align:center;';
                errCard.innerHTML = '<div style="font-size:10px;color:var(--danger-red);">✗ ' + escHtml(file.name) + '<br>Failed</div>';
                gridEl.appendChild(errCard);
            }
        }

        statusEl.textContent = 'Done! ' + _converter.results.length + ' file(s) converted.';
        var ctrlEl = document.getElementById('converter-controls');
        var dlBtn  = document.getElementById('converter-download-btn');
        if (_converter.results.length > 0) {
            ctrlEl.style.display = 'block';
            dlBtn.innerText = _converter.results.length === 1
                ? '⬇ DOWNLOAD ' + fmt.label
                : '⬇ DOWNLOAD ' + _converter.results.length + ' FILES AS ZIP';
        }
    };

    window._convertFile = function(file, mimeType, quality) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var img = new Image();
                img.onload = function() {
                    var c    = document.createElement('canvas');
                    c.width  = img.naturalWidth  || img.width;
                    c.height = img.naturalHeight || img.height;
                    c.getContext('2d').drawImage(img, 0, 0);
                    c.toBlob(function(b) {
                        if (b) resolve(b); else reject(new Error('Export failed'));
                    }, mimeType, quality);
                };
                img.onerror = function() { reject(new Error('Failed to load image')); };
                img.src = e.target.result;
            };
            reader.onerror = function() { reject(new Error('Failed to read file')); };
            reader.readAsDataURL(file);
        });
    };

    window.downloadConverted = async function() {
        if (_converter.results.length === 0) return;
        var btn      = document.getElementById('converter-download-btn');
        var origText = btn.innerText;
        btn.disabled = true; btn.innerText = 'DOWNLOADING...';
        try {
            if (_converter.results.length === 1) {
                var r   = _converter.results[0];
                var url = URL.createObjectURL(r.blob);
                var a   = document.createElement('a');
                a.href = url; a.download = r.name;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                var zip = new JSZip();
                _converter.results.forEach(function(r) { zip.file(r.name, r.blob); });
                var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
                var url2 = URL.createObjectURL(zipBlob);
                var a2   = document.createElement('a');
                a2.href = url2; a2.download = 'converted-' + Date.now() + '.zip';
                document.body.appendChild(a2); a2.click();
                document.body.removeChild(a2);
                URL.revokeObjectURL(url2);
            }
            btn.innerText = 'DOWNLOADED! ✓'; btn.style.background = 'var(--success-green)';
            setTimeout(function() { btn.innerText = origText; btn.style.background = ''; btn.disabled = false; }, 2500);
        } catch(err) {
            _dbg && console.error(err);
            window.showAppAlert("Download Error", "Failed to download. Please try again.", "error");
            btn.innerText = origText; btn.disabled = false;
        }
    };

    // ============================================================
    // IMAGE HOSTING TAB
    // ============================================================
    const HOST_STORAGE_KEY = 'ps_hosted_images';

    function getHostHistory() {
        try { return JSON.parse(sessionStorage.getItem(HOST_STORAGE_KEY) || '[]'); }
        catch { return []; }
    }

    function saveHostHistory(items) {
        sessionStorage.setItem(HOST_STORAGE_KEY, JSON.stringify(items.slice(0, 20)));
    }

    function setHostStatus(msg, color) {
        var el = document.getElementById('host-status');
        if (!el) return;
        el.style.display = msg ? '' : 'none';
        el.style.color   = color || '#30BBAD';
        el.textContent   = msg || '';
    }

    window.handleHostUpload = async function(files) {
        var file = files && files[0];
        if (!file) return;

        var result = document.getElementById('host-result');
        result.style.display = 'none';
        setHostStatus('Uploading\u2026');

        var form = new FormData();
        form.append('file', file);

        try {
            var res  = await fetch(window.CLOUDFLARE_HOST_URL, { method: 'POST', body: form });
            var data = await res.json();
            if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');

            setHostStatus('');

            // Populate result card
            var preview = document.getElementById('host-preview');
            preview.src = data.url;
            document.getElementById('host-url-input').value = data.url;

            var exp = new Date(data.expires);
            var daysLeft = Math.round((exp - Date.now()) / 86400000);
            document.getElementById('host-expiry').innerHTML =
                '&#x23F3; Expires in ' + daysLeft + ' days &mdash; ' +
                exp.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) +
                ' at ' + exp.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });

            result.style.display = '';

            // Persist to history
            var hist = getHostHistory();
            hist.unshift({
                url:        data.url,
                id:         data.id,
                expires:    data.expires,
                name:       sanitizeFilename(file.name),
                uploadedAt: new Date().toISOString(),
            });
            saveHostHistory(hist);
            window.renderHostHistory();

            // Reset file input so the same file can be re-uploaded
            var fi = document.getElementById('host-file-in');
            if (fi) fi.value = '';

        } catch (e) {
            setHostStatus('Error: ' + e.message, '#ff6b6b');
        }
    };

    window.copyHostUrl = function() {
        var input = document.getElementById('host-url-input');
        var btn   = input ? input.parentNode.querySelector('button') : null;
        if (!input || !btn) return;
        navigator.clipboard.writeText(input.value).then(function() {
            var prev = btn.textContent;
            btn.textContent = 'COPIED!';
            btn.style.background = 'var(--success-green, #30BBAD)';
            setTimeout(function() { btn.textContent = prev; btn.style.background = ''; }, 1500);
        });
    };

    window.resetHostPanel = function() {
        document.getElementById('host-result').style.display = 'none';
        setHostStatus('');
    };

    window.renderHostHistory = function() {
        var list = document.getElementById('host-history-list');
        var wrap = document.getElementById('host-history');
        if (!list || !wrap) return;

        var hist = getHostHistory();
        if (!hist.length) { wrap.style.display = 'none'; return; }

        wrap.style.display = '';
        list.innerHTML = hist.map(function(item, i) {
            var exp     = new Date(item.expires);
            var expired = Date.now() > exp.getTime();
            var daysLeft = expired ? 0 : Math.ceil((exp - Date.now()) / 86400000);
            var expLabel = expired
                ? '<span style="color:#ff6b6b;">Expired</span>'
                : '<span style="color:#9888c0;">' + daysLeft + 'd left</span>';
            var copyBtn = !expired
                ? '<button class="action-btn btn-secondary host-hist-btn" onclick="window.copyHostHistItem(' + i + ')">COPY</button>'
                : '';
            return '<div class="host-hist-item" style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; margin-bottom:8px;">' +
                '<img src="' + (expired ? '' : escHtml(item.url)) + '" alt="" style="width:48px; height:32px; object-fit:cover; border-radius:4px; background:rgba(255,255,255,0.05); flex-shrink:0;">' +
                '<span style="flex:1; font-size:12px; color:#f0eeff; font-family:\'Plus Jakarta Sans\',sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + escHtml(item.name) + '">' + escHtml(item.name || 'Image') + '</span>' +
                '<span style="font-size:11px; flex-shrink:0;">' + expLabel + '</span>' +
                (!expired ? '<button class="action-btn btn-secondary host-hist-btn" data-copy-idx="' + i + '">COPY</button>' : '') +
                '<button class="action-btn btn-secondary host-hist-btn" data-rm-idx="' + i + '" title="Remove from history">&times;</button>' +
                '</div>';
        }).join('');
    };

    window.copyHostHistItem = function(i) {
        var hist = getHostHistory();
        if (!hist[i]) return;
        navigator.clipboard.writeText(hist[i].url).then(function() {
            // Brief visual feedback via status bar
            setHostStatus('Link copied!');
            setTimeout(function() { setHostStatus(''); }, 1500);
        });
    };

    window.removeHostHistItem = function(i) {
        var hist = getHostHistory();
        hist.splice(i, 1);
        saveHostHistory(hist);
        window.renderHostHistory();
    };

    window.clearHostHistory = function() {
        saveHostHistory([]);
        window.renderHostHistory();
    };



    /* ============================================================
       SHARE & GET PRINTED
       ============================================================ */

    window.shareDesign = async function(mode) {
        var isAdv       = (mode === 'adv');
        var btnId       = isAdv ? 'sidebar-share-btn' : 'simple-share-btn';
        var shareBtn    = document.getElementById(btnId);
        var activeCanvas = isAdv ? window.canvas : window.sCanvas;

        // Guard: need artwork
        var hasArt = activeCanvas && (
            activeCanvas.getObjects().find(function(o){ return o.name === 'art'; }) ||
            activeCanvas.backgroundColor
        );
        if (!hasArt) {
            window.showAppAlert("No Artwork", "Please upload artwork before sharing.", "error");
            return;
        }

        var origText = shareBtn.textContent;
        shareBtn.textContent = 'UPLOADING…';
        shareBtn.disabled = true;

        try {
            var blob     = await buildPrintCanvas(isAdv, activeCanvas);
            var filename = window.buildPrintFilename();
            var form     = new FormData();
            form.append('file', blob, filename);

            var res  = await fetch(window.CLOUDFLARE_HOST_URL, { method: 'POST', body: form });
            var data = await res.json();
            if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');

            // Show the share modal with the link
            document.getElementById('share-url-output').value = data.url;
            var exp = new Date(data.expires);
            var daysLeft = Math.round((exp - Date.now()) / 86400000);
            document.getElementById('share-expiry-note').textContent =
                'Link expires in ' + daysLeft + ' day' + (daysLeft !== 1 ? 's' : '') + '.';
            document.getElementById('share-result-modal').style.display = 'flex';

            shareBtn.textContent = 'SHARED! ✓';
            shareBtn.style.background = 'var(--success-green)';
            setTimeout(function() {
                shareBtn.textContent = origText;
                shareBtn.style.background = '';
                shareBtn.disabled = false;
            }, 3000);
        } catch(e) {
            window.showAppAlert("Share Error", e.message || "Upload failed. Please try again.", "error");
            shareBtn.textContent = origText;
            shareBtn.disabled = false;
        }
    };

    window.copyShareUrl = function() {
        var input = document.getElementById('share-url-output');
        var copyBtn = document.getElementById('share-copy-btn');
        if (!input || !input.value) return;
        navigator.clipboard.writeText(input.value).catch(function() {
            input.select();
            document.execCommand('copy');
        });
        var orig = copyBtn.textContent;
        copyBtn.textContent = 'COPIED! ✓';
        setTimeout(function() { copyBtn.textContent = orig; }, 1800);
    };

    window.openGetPrinted = async function(mode) {
        mode = mode || 'simple';
        var isAdv        = (mode === 'adv');
        var btnId        = isAdv ? 'sidebar-print-btn' : 'simple-print-btn';
        var printBtn     = document.getElementById(btnId);
        var activeCanvas = isAdv ? window.canvas : window.sCanvas;

        var hasArt = activeCanvas && (
            activeCanvas.getObjects().find(function(o){ return o.name === 'art'; }) ||
            activeCanvas.backgroundColor
        );
        if (!hasArt) {
            window.showAppAlert("No Artwork", "Please upload artwork before ordering a print.", "error");
            return;
        }

        var origText = printBtn.innerHTML;
        printBtn.innerHTML = 'UPLOADING&hellip;';
        printBtn.disabled  = true;

        try {
            var blob     = await buildPrintCanvas(isAdv, activeCanvas);
            var filename = window.buildPrintFilename();
            var form     = new FormData();
            form.append('file', blob, filename);

            var res  = await fetch(window.CLOUDFLARE_HOST_URL, { method: 'POST', body: form });
            var data = await res.json();
            if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');

            document.getElementById('print-url-output').value = data.url;
            var exp      = new Date(data.expires);
            var daysLeft = Math.round((exp - Date.now()) / 86400000);
            document.getElementById('print-expiry-note').textContent =
                'Link expires in ' + daysLeft + ' day' + (daysLeft !== 1 ? 's' : '') + '.';
            document.getElementById('get-printed-modal').style.display = 'flex';

            printBtn.innerHTML = '&#10003; READY!';
            printBtn.style.background = '#83BB30';
            setTimeout(function() {
                printBtn.innerHTML = origText;
                printBtn.style.background = '';
                printBtn.disabled = false;
            }, 3000);
        } catch(e) {
            window.showAppAlert("Upload Error", e.message || "Upload failed. Please try again.", "error");
            printBtn.innerHTML = origText;
            printBtn.disabled  = false;
        }
    };

    window.copyPrintUrl = function() {
        var input   = document.getElementById('print-url-output');
        var copyBtn = document.getElementById('print-copy-btn');
        if (!input || !input.value) return;
        navigator.clipboard.writeText(input.value).catch(function() {
            input.select();
            document.execCommand('copy');
        });
        var orig = copyBtn.textContent;
        copyBtn.textContent = 'COPIED! \u2713';
        setTimeout(function() { copyBtn.textContent = orig; }, 1800);
    };

    // ============================================================
    // EVENT LISTENERS — replaces all inline handlers from HTML
    // ============================================================
    window.initEventListeners = function() {
        function on(id, evt, fn) { var el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }
        function hide(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }

        // ── Modals ──
        on('app-alert-close-x',   'click', function() { hide('app-alert-modal'); });
        on('app-alert-btn',       'click', function() { hide('app-alert-modal'); });
        on('app-alert-retry-btn', 'click', function() { hide('app-alert-modal'); if (window._alertRetryFn) window._alertRetryFn(); });
        on('dpi-help-btn',        'click', function() { window.openHelpModal(); });
        on('dpi-understand-btn',  'click', function() { hide('dpi-warning-modal'); });
        on('ai-warn-cancel-btn',  'click', function() { hide('ai-warning-modal'); });
        on('ai-warn-proceed-btn', 'click', function() { window.runAutoFrameBreak(); });
        on('ai-upscale-cancel-btn',  'click', function() { hide('ai-upscale-modal'); });
        on('ai-upscale-proceed-btn', 'click', function() { window.runAutoUpscale(); });
        on('ai-success-close-x',  'click', function() { hide('ai-success-modal'); });
        on('ai-success-btn',      'click', function() { hide('ai-success-modal'); });
        on('url-paste-close-x',   'click', function() { hide('url-paste-modal'); });
        on('url-paste-submit',    'click', function() { window.submitUrlPaste(); });
        on('help-close-x',        'click', function() { hide('help-modal'); });
        on('bleed-back-btn',      'click', function() { window._closeBleedConfirm(); });
        on('bleed-proceed-btn',   'click', function() { window._proceedDespiteBleed(); });
        on('share-result-close',  'click', function() { hide('share-result-modal'); });
        on('get-printed-close',   'click', function() { hide('get-printed-modal'); });
        on('privacy-close-btn',   'click', function() { hide('privacy-modal'); });
        on('footer-privacy-link', 'click', function(e) { e.preventDefault(); document.getElementById('privacy-modal').style.display = 'flex'; });
        on('privacy-contact-link','click', function() { hide('privacy-modal'); });

        // ── Mat size buttons ──
        document.querySelectorAll('.mat-size-btn[data-size]').forEach(function(btn) {
            btn.addEventListener('click', function() { window.selectMatSize(this.dataset.size, this); });
        });

        // ── Tab buttons ──
        document.querySelectorAll('.tool-tab-btn[data-tab]').forEach(function(btn) {
            btn.addEventListener('click', function() { window.switchTab(this.dataset.tab); });
        });

        // ── Accordion buttons ──
        document.querySelectorAll('.acc-btn[data-acc]').forEach(function(btn) {
            btn.addEventListener('click', function() { window.toggleAcc(this.dataset.acc); });
        });

        // ── Drop zones ──
        function setupDropZone(zoneId, fileInputId, handlerFn) {
            var zone = document.getElementById(zoneId);
            if (!zone) return;
            zone.addEventListener('dragover',  function(e) { e.preventDefault(); this.classList.add('dz-hover'); });
            zone.addEventListener('dragleave', function()  { this.classList.remove('dz-hover'); });
            zone.addEventListener('drop',      function(e) { e.preventDefault(); this.classList.remove('dz-hover'); handlerFn(e.dataTransfer.files); });
            zone.addEventListener('click',     function()  { document.getElementById(fileInputId).click(); });
        }
        setupDropZone('batch-drop-zone',    'batch-file-in',     window.handleBatchFiles);
        setupDropZone('converter-drop-zone','converter-file-in', window.handleConverterFiles);
        setupDropZone('host-drop-zone',     'host-file-in',      window.handleHostUpload);

        // ── File inputs ──
        on('batch-file-in',     'change', function() { window.handleBatchFiles(this.files); });
        on('converter-file-in', 'change', function() { window.handleConverterFiles(this.files); });
        on('host-file-in',      'change', function() { window.handleHostUpload(this.files); });
        on('simple-file-in',    'change', function() { window.handleSimpleUpload(this); });
        on('adv-file-in',       'change', function() { window.handleUpload(this); });

        // ── Batch / Converter controls ──
        on('batch-clear-btn',        'click', function() { window.clearBatch(); });
        on('converter-download-btn', 'click', function() { window.downloadConverted(); });
        on('converter-clear-btn',    'click', function() { window.clearConverter(); });

        // Event delegation for dynamically generated batch download buttons
        var batchGrid = document.getElementById('batch-preview-grid');
        if (batchGrid) {
            batchGrid.addEventListener('click', function(e) {
                var btn = e.target.closest('[data-dl-idx]');
                if (btn) window.downloadBatchSingle(parseInt(btn.dataset.dlIdx, 10));
            });
        }

        // ── Image Host controls ──
        on('host-copy-btn',           'click', function() { window.copyHostUrl(); });
        on('host-upload-another-btn', 'click', function() { window.resetHostPanel(); });
        on('host-clear-history-btn',  'click', function() { window.clearHostHistory(); });

        // Event delegation for dynamically generated host history buttons
        var histList = document.getElementById('host-history-list');
        if (histList) {
            histList.addEventListener('click', function(e) {
                var btn = e.target.closest('[data-copy-idx]');
                if (btn) { window.copyHostHistItem(parseInt(btn.dataset.copyIdx, 10)); return; }
                btn = e.target.closest('[data-rm-idx]');
                if (btn) window.removeHostHistItem(parseInt(btn.dataset.rmIdx, 10));
            });
        }

        // ── Simple editor ──
        on('s-restart-btn',    'click', function() { window.restartApp(); });
        on('s-fs-toggle-btn',  'click', function() { window.toggleSimpleFullScreen(); });
        on('s-upload-file-btn','click', function() { document.getElementById('simple-file-in').click(); });
        on('s-paste-url-btn',  'click', function() { window.promptPasteUrl(); });
        on('s-zoom-in',        'input', function() { window.handleSimpleZoom(this.value); });
        on('s-rotate-btn',     'click', function() { window.rotateSimpleArt(); });
        on('s-fit-btn',        'click', function() { window.forceSimpleFit(); });
        on('s-btn-enhance',    'click', function() { window.toggleSimpleFilter('enhance'); });
        on('s-btn-grayscale',  'click', function() { window.toggleSimpleFilter('grayscale'); });
        on('s-guides-btn',     'click', function() { window.toggleSimpleGuides(); });
        on('s-game-sel',       'change', function() { window.filterSimpleFormats(); });
        on('s-format-sel',     'change', function() { window.filterSimpleHands(); });
        on('s-hand-sel',       'change', function() { window.applySimpleLayout(); });
        on('s-rb-points-sel',  'change', function() { window.changeRbPoints(); });
        on('s-col',            'input',  function() { window.renderSimpleLayout(); });
        on('simple-print-btn', 'click', function() { window.openGetPrinted('simple'); });
        on('simple-atc',       'click', function() { window.downloadDesign('simple'); });
        on('simple-share-btn', 'click', function() { window.shareDesign('simple'); });

        // ── Advanced editor ──
        on('adv-restart-btn',    'click', function() { window.restartApp(); });
        on('fs-toggle-btn',      'click', function() { window.toggleFullScreen(); });
        var szCont = document.getElementById('canvas-size-btns');
        if (szCont) {
            szCont.addEventListener('click', function(e) {
                var btn = e.target.closest('.canvas-sz-btn');
                if (!btn) return;
                APP.canvasSizeMode = btn.dataset.sz;
                document.querySelectorAll('.canvas-sz-btn').forEach(function(b) { b.classList.remove('canvas-sz-active'); });
                btn.classList.add('canvas-sz-active');
                window.changeSize();
            });
        }
        on('adv-upload-file-btn','click', function() { window.triggerUpload(); });
        on('adv-paste-url-btn',  'click', function() { window.promptPasteUrl(); });
        on('ai-upscale-btn-adv', 'click', function() { window.confirmAutoUpscale(true); });
        on('bg-color-picker',    'input', function() { window.syncHex('bg-color-picker','bg-color-hex'); window.setSolidBackground(this.value); });
        on('bg-color-hex',       'input', function() { window.syncColor('bg-color-hex','bg-color-picker'); window.setSolidBackground(document.getElementById('bg-color-picker').value); });
        on('game-sel',           'change', function() { window.filterFormats(); });
        on('format-sel',         'change', function() { window.filterHands(); });
        on('hand-sel',           'change', function() { window.applyFinalLayout(); });
        on('rb-points-sel',      'change', function() { window.changeRbPoints(); });
        on('mode-sel',           'change', function() { window.renderLayout(); });
        on('col-1',              'input',  function() { window.syncHex('col-1','col-1-hex'); window.renderLayout(); });
        on('col-1-hex',          'input',  function() { window.syncColor('col-1-hex','col-1'); window.renderLayout(); });
        on('col-2-trans',        'change', function() { window.renderLayout(); });
        on('col-2',              'input',  function() { window.syncHex('col-2','col-2-hex'); window.renderLayout(); });
        on('col-2-hex',          'input',  function() { window.syncColor('col-2-hex','col-2'); window.renderLayout(); });
        on('angle-in',           'input',  function() { window.renderLayout(); });
        on('op-in',              'input',  function() { window.updateOpacity(); });
        on('ai-fb-btn',          'click',  function() { window.confirmAutoFrameBreak(); });
        on('ai-fb-clear-btn',    'click',  function() { window.clearAutoFrameBreak(); });
        on('mask-toggle-btn',    'click',  function() { window.toggleMaskMode(); });
        on('brush-size',         'input',  function() { window.updateCursorStyle(); });
        on('mask-undo-btn',      'click',  function() { window.undoMask(); });
        on('mask-reset-btn',     'click',  function() { window.resetMask(); });
        on('recolor-toggle-btn', 'click',  function() { window.toggleRecolorMode(); });
        on('recolor-size',       'input',  function() { window.updateRecolorBrush(); });
        on('recolor-color',      'input',  function() { window.updateRecolorBrush(); });
        on('recolor-undo-btn',   'click',  function() { window.undoRecolor(); });
        on('recolor-reset-btn',  'click',  function() { window.resetRecolor(); });
        on('filter-brightness',  'input',  function() { window.updateFilters(); });
        on('filter-contrast',    'input',  function() { window.updateFilters(); });
        on('filter-saturation',  'input',  function() { window.updateFilters(); });
        on('filter-vibrance',    'input',  function() { window.updateFilters(); });
        on('filter-hue',         'input',  function() { window.updateFilters(); });
        on('filter-blur',        'input',  function() { window.updateFilters(); });
        on('filter-shadows',     'input',  function() { window.updateFilters(); });
        on('filter-warmth',      'input',  function() { window.updateFilters(); });
        on('filter-vignette',    'input',  function() { window.updateVignette(); window.syncSliderDisplays(); });
        on('auto-opt-btn-adv',   'click',  function() { window.autoOptimizePrintAdv(); });
        on('adv-reset-colors-btn','click', function() { window.resetFilters(); });
        on('adv-guides-btn',     'click',  function() { window.toggleAdvGuides(); });
        on('zoom-in',            'input',  function() { window.handleZoom(this.value); });
        on('adv-reset-scale-btn','click',  function() { window.forceFit(); });
        on('adv-font-family',       'change', function() { window.updateAdvTextAttr('fontFamily', this.value); });
        on('adv-text-size-in',      'input',  function() { window.updateAdvTextAttr('fontSize', parseInt(this.value, 10)); });
        on('adv-text-col',          'input',  function() { window.updateAdvTextAttr('fill', this.value); });
        on('adv-text-stroke',       'input',  function() { window.updateAdvTextAttr('stroke', this.value); });
        on('adv-text-stroke-width', 'input',  function() { window.updateAdvTextAttr('strokeWidth', parseFloat(this.value)); });
        on('adv-text-bold-btn',     'click',  function() {
            const obj = window.canvas.getActiveObject(); if (!obj) return;
            const isBold = obj.fontWeight === 'bold';
            window.updateAdvTextAttr('fontWeight', isBold ? 'normal' : 'bold');
            this.style.background = isBold ? '' : 'var(--brand-hover)';
        });
        on('adv-text-italic-btn',   'click',  function() {
            const obj = window.canvas.getActiveObject(); if (!obj) return;
            const isItalic = obj.fontStyle === 'italic';
            window.updateAdvTextAttr('fontStyle', isItalic ? 'normal' : 'italic');
            this.style.background = isItalic ? '' : 'var(--brand-hover)';
        });
        on('adv-text-align-left',   'click',  function() { window.updateAdvTextAttr('textAlign','left');   ['left','center','right'].forEach(a=>{const b=document.getElementById('adv-text-align-'+a);if(b)b.style.background=a==='left'?'var(--brand-hover)':''}); });
        on('adv-text-align-center', 'click',  function() { window.updateAdvTextAttr('textAlign','center'); ['left','center','right'].forEach(a=>{const b=document.getElementById('adv-text-align-'+a);if(b)b.style.background=a==='center'?'var(--brand-hover)':''}); });
        on('adv-text-align-right',  'click',  function() { window.updateAdvTextAttr('textAlign','right');  ['left','center','right'].forEach(a=>{const b=document.getElementById('adv-text-align-'+a);if(b)b.style.background=a==='right'?'var(--brand-hover)':''}); });
        on('adv-add-text-btn',      'click',  function() { window.addAdvText(); });
        on('adv-delete-btn',        'click',  function() { window.removeAdvActive(); });
        // Custom overlay
        on('adv-overlay-upload-btn', 'click', function() { document.getElementById('adv-overlay-file-in').click(); });
        on('adv-overlay-file-in',    'change',function() { window.loadAdvOverlay(this.files[0]); });
        on('adv-overlay-lock-btn',   'click', function() { window.toggleOverlayLock(); });
        on('adv-overlay-clear-btn',  'click', function() { window.clearAdvOverlay(); });
        on('adv-rotate-btn',     'click',  function() { window.transformActive('rotate'); });
        on('adv-flipx-btn',      'click',  function() { window.transformActive('flipX'); });
        on('adv-flipy-btn',      'click',  function() { window.transformActive('flipY'); });
        on('transform-rotation', 'input',  function() { window.transformActive('angle', this.value); });
        on('adv-reset-rotation-btn','click',function() { window.transformActive('angle', 0); });
        on('sidebar-print-btn',  'click',  function() { window.openGetPrinted('adv'); });
        on('sidebar-atc',        'click',  function() { window.downloadDesign('adv'); });
        on('sidebar-share-btn',  'click',  function() { window.shareDesign('adv'); });
        on('ws-zoom-in-btn',     'click',  function() { window.workspaceZoom(0.1); });
        on('ws-zoom-out-btn',    'click',  function() { window.workspaceZoom(-0.1); });
        on('ws-zoom-reset-btn',  'click',  function() { window.workspaceZoom(0); });

        // ── Share / Get Printed modals ──
        on('share-copy-btn', 'click', function() { window.copyShareUrl(); });
        on('print-copy-btn', 'click', function() { window.copyPrintUrl(); });

        // ── Clipboard paste: Ctrl+V / ⌘V to load artwork from clipboard ──
        document.addEventListener('paste', function(e) {
            // Don't intercept paste while user is editing a text object on the canvas
            if (window.canvas && window.canvas.getActiveObject()?.isEditing) return;
            const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) window.handleUpload({ files: [file] });
                    break;
                }
            }
        });

        // ── Slider interaction guards ──
        // 1) Clicks on the track (not the thumb) are blocked — user must grab and
        //    drag the thumb directly.
        // 2) Mouse-wheel over a slider scrolls the page instead of changing the value.
        // 3) Touch: vertical swipe scrolls the page; horizontal swipe on the thumb drags.
        document.querySelectorAll('input[type="range"]').forEach(function(slider) {

            // Thumb hit-test: returns true when clientX is within ±12 px of the
            // thumb's current rendered position (thumb is 16 px wide so this gives
            // a comfortable but intentional grab zone).
            function isOnThumb(clientX) {
                var rect = slider.getBoundingClientRect();
                var min  = parseFloat(slider.min)   || 0;
                var max  = parseFloat(slider.max)   || 100;
                var val  = parseFloat(slider.value);
                var ratio    = (val - min) / (max - min);
                var thumbX   = rect.left + ratio * rect.width;
                return Math.abs(clientX - thumbX) <= 12;
            }

            // Block track clicks on mouse.
            slider.addEventListener('mousedown', function(e) {
                if (!isOnThumb(e.clientX)) {
                    e.preventDefault();
                }
            });

            // Mouse wheel: pass scroll through to the page.
            slider.addEventListener('wheel', function(e) {
                e.preventDefault();
                var delta = e.deltaY;
                if (e.deltaMode === 1) delta *= 40;
                if (e.deltaMode === 2) delta *= window.innerHeight;
                window.scrollBy(0, delta);
            }, { passive: false });

            // Touch: block track taps and detect vertical-scroll vs horizontal-drag.
            var startX, startY, isScroll, thumbHit;

            slider.addEventListener('touchstart', function(e) {
                var t = e.touches[0];
                startX   = t.clientX;
                startY   = t.clientY;
                isScroll = false;
                thumbHit = isOnThumb(t.clientX);
            }, { passive: true });

            slider.addEventListener('touchmove', function(e) {
                if (startX === undefined) return;
                var t  = e.touches[0];
                var dx = Math.abs(t.clientX - startX);
                var dy = Math.abs(t.clientY - startY);

                // Classify as a page scroll if vertical motion wins out.
                if (!isScroll && dy > 8 && dy > dx) {
                    isScroll = true;
                }

                if (isScroll || !thumbHit) {
                    e.preventDefault();
                    if (isScroll) {
                        window.scrollBy(0, startY - t.clientY);
                        startY = t.clientY;
                    }
                }
            }, { passive: false });

            slider.addEventListener('touchend', function() {
                isScroll = thumbHit = false;
                startX = startY = undefined;
            }, { passive: true });
        });
    };
