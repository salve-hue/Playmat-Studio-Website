# Security Audit — Playmat Studio Website
**Date:** 2026-03-12
**Scope:** Full codebase review (`index.html`, `tool.js`, `main.js`, `playmat-host-worker.js`, `.htaccess`)
**Total findings:** 16 (2 Critical · 4 High · 5 Medium · 5 Low)

---

## Critical

### C1 — XSS via `innerHTML` with user-controlled content
**File:** `assets/js/tool.js` — lines 163, 1779–1785, 2100–2117 (and others throughout)

Multiple `innerHTML` assignments are built from user-supplied or user-derived data:

- `showAppAlert()` at line 163 sets `textEl.innerHTML = message` with no sanitisation.
- Batch result cards (lines 1779–1785) and upload history cards (lines 2100–2117) build HTML via template literals using filenames and URLs sourced from user uploads and `localStorage`.

If any of those values contain `<script>` tags or event-handler attributes, they execute in the page context.

**Fix:** Replace `innerHTML` with `textContent` for plain text nodes. Where rich markup is genuinely needed, sanitise with [DOMPurify](https://github.com/cure53/DOMPurify) before assignment.

---

### C2 — No Content Security Policy (CSP)
**File:** `index.html`, `.htaccess`

No `Content-Security-Policy` header or `<meta>` equivalent exists anywhere in the project. Without a CSP, any XSS vulnerability has unrestricted impact — injected scripts can exfiltrate data, hijack the canvas, or call the Cloudflare worker endpoints freely.

**Fix:** Add to `.htaccess`:

```apache
Header set Content-Security-Policy "default-src 'self'; \
  script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'unsafe-inline'; \
  style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; \
  font-src 'self' https://fonts.gstatic.com; \
  img-src 'self' https: data: blob:; \
  connect-src 'self' https://playmat-upscaler.salve.workers.dev \
    https://playmat-removebg.salve.workers.dev \
    https://files.playmatstudio.com; \
  worker-src blob:;"
```

---

## High

### H1 — CDN scripts loaded without Subresource Integrity (SRI)
**File:** `index.html` — lines 31–33

Three external scripts are loaded with no integrity check:

```html
<script src="https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.3/..."></script>
<script src="https://cdnjs.cloudflare.com/.../fabric.js/5.3.1/fabric.min.js"></script>
<script src="https://cdnjs.cloudflare.com/.../jszip/3.10.1/jszip.min.js"></script>
```

If a CDN is compromised or the URL is typosquatted, arbitrary code runs with full page privileges — including access to the canvas and the Cloudflare worker endpoints.

**Fix:** Generate `integrity` hashes (`sha384-...`) and add `crossorigin="anonymous"` to each tag. Use [srihash.org](https://www.srihash.org/) or `openssl dgst -sha384 -binary <file> | openssl base64 -A`.

---

### H2 — Worker API URLs and endpoint structure exposed in frontend
**File:** `assets/js/tool.js` — lines 13–17

```javascript
window.CLOUDFLARE_WORKER_URL    = 'https://playmat-upscaler.salve.workers.dev';
window.CLOUDFLARE_BG_WORKER_URL = 'https://playmat-removebg.salve.workers.dev/';
window.CLOUDFLARE_UPLOAD_URL    = 'https://files.playmatstudio.com/';
window.CLOUDFLARE_HOST_URL      = 'https://files.playmatstudio.com';
```

Anyone can make direct requests to these endpoints, bypassing the intended UI flow. The upscaler and background-removal workers call paid Replicate API endpoints — repeated direct calls drive up costs with no user interaction required.

**Fix:** Add Cloudflare rate-limiting rules to the worker routes (Cloudflare dashboard → Security → Rate Limiting). For the AI workers, consider requiring a short-lived token (issued server-side or via a Cloudflare Access policy) so arbitrary callers cannot consume quota.

---

### H3 — Unvalidated arbitrary URLs loaded through third-party CORS proxies
**File:** `assets/js/tool.js` — lines 642–643, 669, 730, 1027, 1240

Overlay and external images are fetched via:

```javascript
`https://wsrv.nl/?url=${encodeURIComponent(url)}`
`https://corsproxy.io/?${encodeURIComponent(url)}`
```

The `url` value comes from user-provided overlay URLs with no domain allowlist. This means:
- Requests can be directed to private/internal addresses through the proxy (SSRF-by-proxy).
- Both proxy services are third-party and outside your control; they could be compromised or return malicious payloads.

**Fix:** Restrict allowed URL origins to a whitelist of known CDN domains (e.g. `pub-*.r2.dev`, `files.playmatstudio.com`). Validate with a regex or `URL` constructor before passing to the proxy.

---

### H4 — Upload history written to `localStorage` in plain text
**File:** `assets/js/tool.js` — lines ~2005–2010

Uploaded file URLs, filenames, and expiry timestamps are stored in `localStorage` indefinitely. Any XSS on the same origin can read and exfiltrate this store. Stored items persist across sessions and accumulate over time.

**Fix:** Replace `localStorage` with `sessionStorage` so history clears when the tab closes. Enforce the existing 20-item cap with a TTL check on read, and remove expired entries automatically.

---

## Medium

### M1 — Missing security response headers
**File:** `.htaccess`

The following headers are absent:

| Header | Risk |
|---|---|
| `X-Frame-Options: SAMEORIGIN` | Clickjacking — site can be embedded in a hostile iframe |
| `X-Content-Type-Options: nosniff` | Browser MIME sniffing could execute uploaded content as script |
| `Strict-Transport-Security` | No HSTS — clients not instructed to enforce HTTPS |
| `Referrer-Policy: strict-origin-when-cross-origin` | Full URL sent as `Referer` on outbound requests |

**Fix:**

```apache
Header set X-Frame-Options "SAMEORIGIN"
Header set X-Content-Type-Options "nosniff"
Header set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header set Referrer-Policy "strict-origin-when-cross-origin"
```

---

### M2 — URL query parameters constructed via string concatenation
**File:** `assets/js/tool.js` — lines 724, 1122

```javascript
fetch(`${window.CLOUDFLARE_WORKER_URL}?id=${prediction.id}`)
```

If `prediction.id` ever contains `&` or `#` characters (e.g. from a malformed API response), the query string is silently corrupted, potentially leaking a parameter to a different endpoint.

**Fix:** Use `URLSearchParams`:

```javascript
const url = new URL(window.CLOUDFLARE_WORKER_URL);
url.searchParams.set('id', prediction.id);
fetch(url);
```

---

### M3 — File upload lacks filename sanitisation
**File:** `assets/js/tool.js` — lines ~1768, 1771, 2059; `playmat-host-worker.js` — lines 87–94

Uploaded filenames are stored and later rendered in result cards and history panels without normalisation. A filename like `"><img src=x onerror=alert(1)>.png` would be injected verbatim into any `innerHTML` context (see C1).

**Fix:** Sanitise filenames to alphanumerics, dashes, underscores, and a single dot before storing or rendering. Example:

```javascript
const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
```

---

### M4 — Overly permissive CORS on the R2/worker endpoint
**File:** `playmat-host-worker.js` — lines 34–38

The worker returns `Access-Control-Allow-Origin: *` unconditionally. Any origin can POST files to the upload endpoint or GET hosted assets.

**Fix:** Restrict to your own domain:

```javascript
const ALLOWED_ORIGINS = ['https://playmatstudio.com'];
const origin = request.headers.get('Origin') ?? '';
const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';
```

---

### M5 — No rate limiting on the R2 upload worker
**File:** `playmat-host-worker.js`

No per-IP or per-session throttle exists. An automated script could flood the R2 bucket with 50 MB files, exhausting storage quota and egress bandwidth with no friction.

**Fix:** Enable Cloudflare Rate Limiting on the worker route (e.g. 10 requests/minute per IP). Alternatively, add a lightweight token-bucket check inside the worker using the IP from `request.headers.get('CF-Connecting-IP')`.

---

## Low

### L1 — `document.write()` used for stylesheet injection
**File:** `index.html` — lines 19–28

The inline version-busting script uses `document.write()` to inject `<link>` tags. `document.write()` is deprecated, blocks parsing, and clears the page if called after load.

**Fix:**

```javascript
['main', 'tool', 'custom', 'noscript'].forEach(function(name) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'assets/css/' + name + '.css?v=' + v;
    document.head.appendChild(link);
});
```

---

### L2 — Verbose `console.error` output in production
**File:** `assets/js/tool.js` — lines 760, 1031, 1138, 1144, 1243, 1246 (and others)

Stack traces, internal URLs, and prediction IDs are logged to the browser console unconditionally, revealing backend architecture to anyone with DevTools open.

**Fix:** Gate logging behind a debug flag:

```javascript
const DEBUG = location.hostname === 'localhost';
if (DEBUG) console.error(err);
```

---

### L3 — No `Permissions-Policy` header
**File:** `.htaccess`

No `Permissions-Policy` is set, so third-party scripts (CDN libraries) could in principle request camera, microphone, or geolocation access.

**Fix:**

```apache
Header set Permissions-Policy "camera=(), microphone=(), geolocation=()"
```

---

### L4 — Google Fonts loaded over external request with no fallback CSP
**File:** `index.html` — line 18

The `<link>` for Google Fonts issues a cross-origin request. If the font CDN is blocked (corporate networks, some regions), the page falls back to system fonts with no graceful degradation. More relevantly, it represents an external dependency that could be used for timing-based user fingerprinting.

**Fix:** Self-host the font files and serve them from the same origin. This also removes the external `fonts.googleapis.com` and `fonts.gstatic.com` connect requirements from CSP.

---

### L5 — Inline event handlers throughout HTML
**File:** `index.html` — throughout the tools section

Dozens of `onclick`, `ondragover`, `ondrop` etc. attributes are defined inline:

```html
ondrop="event.preventDefault(); this.classList.remove('dz-hover'); window.handleHostUpload(event.dataTransfer.files);"
```

Inline handlers cannot be governed by a `script-src` CSP without `'unsafe-inline'`, which weakens the policy significantly.

**Fix:** Attach all event listeners programmatically from `tool.js` using `addEventListener`. This allows a stricter CSP (nonce- or hash-based) to be applied.

---

## Summary table

| ID | Severity | Title |
|---|---|---|
| C1 | Critical | XSS via `innerHTML` with user-controlled content |
| C2 | Critical | No Content Security Policy |
| H1 | High | CDN scripts without Subresource Integrity |
| H2 | High | Worker API URLs exposed with no auth/rate-limit |
| H3 | High | Arbitrary URLs loaded via third-party CORS proxies |
| H4 | High | Upload history in plain `localStorage` |
| M1 | Medium | Missing security response headers (4 headers) |
| M2 | Medium | URL params built via string concatenation |
| M3 | Medium | File upload filenames not sanitised |
| M4 | Medium | Permissive CORS (`*`) on R2 worker |
| M5 | Medium | No rate limiting on upload worker |
| L1 | Low | `document.write()` for stylesheet injection |
| L2 | Low | Verbose `console.error` in production |
| L3 | Low | No `Permissions-Policy` header |
| L4 | Low | Google Fonts loaded from external origin |
| L5 | Low | Inline event handlers block strict CSP |

---

## Recommended remediation order

1. **Immediately:** Add the four missing response headers (M1) — five minutes in `.htaccess`, zero code risk.
2. **Short-term:** Fix `innerHTML` → `textContent`/DOMPurify (C1) and sanitise filenames (M3) — these share the same root cause.
3. **Short-term:** Add SRI hashes to CDN scripts (H1) — mechanical, no logic changes.
4. **Short-term:** Implement CSP (C2) — do this after inline handlers are moved to JS (L5) to avoid needing `'unsafe-inline'`.
5. **Medium-term:** Add Cloudflare rate limiting to worker routes (H2, M5) and restrict CORS origin (M4).
6. **Medium-term:** Replace the CORS proxy pattern with an allowlisted domain check (H3).
7. **Ongoing:** Replace `localStorage` with `sessionStorage` for upload history (H4), gate console output behind a debug flag (L2).
