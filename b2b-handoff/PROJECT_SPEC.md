# Playmat Studio B2B — Full Project Specification

## Vision

Game shops sell custom playmats to their customers. Today, doing this requires: finding a print vendor, setting up an ordering process, handling design files manually, and managing fulfillment. Most shops don't bother.

Playmat Studio B2B removes every obstacle. A shop signs up, customizes their storefront in 10 minutes, and immediately has a fully functional playmat store — with a professional design tool, checkout, and order tracking — all under their own brand.

---

## Stakeholders

| Role | Description |
|---|---|
| **Platform Admin** | Playmat Studio operator. Manages shops, pricing floors, fulfillment. |
| **Shop Admin** | LGS owner/manager. Manages their storefront, views orders, configures branding. |
| **End Customer** | The shop's player/customer. Designs and orders their mat. |
| **Print Vendor** | Third-party print fulfillment. Receives print-ready files. |

---

## User Stories

### Shop Admin

- As a shop admin, I can register my store with my email, store name, and a slug.
- As a shop admin, I can upload my logo and set my brand colors so my storefront matches my store's identity.
- As a shop admin, I can choose whether to show "Powered by Playmat Studio" or hide it entirely.
- As a shop admin, I can set my own prices for each mat size (above the platform minimum).
- As a shop admin, I can see all incoming orders, their status, and download the print-ready design files.
- As a shop admin, I can update order status and add tracking numbers so my customers are informed.
- As a shop admin, I can configure a custom domain so my storefront lives at `mats.mygamestore.com`.

### End Customer

- As a customer, I can visit my local game store's playmat shop and see what mat sizes are available.
- As a customer, I can open the design tool and upload my own artwork, use game overlays, and add text.
- As a customer, I can preview my mat and download a proof before purchasing.
- As a customer, I can check out securely and get an order confirmation email.
- As a customer, I can track my order status.

### Platform Admin

- As the platform admin, I can see all shops and their activity.
- As the platform admin, I can set base prices for each mat size.
- As the platform admin, I can deactivate a shop.

---

## Feature Specifications

### 1. Shop Registration & Onboarding

**Registration form fields:**
- Store name (required)
- URL slug (required, auto-suggested from store name, validated unique)
- Owner email (required)
- Password (required, min 12 chars)

**On submit:**
1. Create `Shop` record with `isActive: false` (pending approval, OR auto-activate — see Open Questions)
2. Send welcome/verification email via Resend
3. Redirect to dashboard

**Slug rules:**
- Lowercase, letters/numbers/hyphens only
- 3–32 characters
- Reserved slugs: `admin`, `api`, `dashboard`, `login`, `register`, `shop`, `www`

---

### 2. Shop Branding Configuration

**Dashboard → Branding page:**

| Field | Type | Default |
|---|---|---|
| Branding mode | Toggle: White Label / Transparent | Transparent |
| Logo | Image upload (PNG/SVG, max 2 MB) | None (shows store name) |
| Primary color | Color picker | `#6830BB` |
| Accent color | Color picker | `#30BBAD` |
| Custom domain | Text input | None |

**Logo upload flow:**
1. Validate file type (PNG, SVG, WEBP only) and size (max 2 MB) server-side
2. Upload to R2 at `shops/{shopId}/logo.{ext}`
3. Store public URL in `Shop.logoUrl`
4. Invalidate/bust CDN cache if applicable

**Custom domain setup (Phase 2):**
1. Shop admin enters their domain (e.g. `mats.mygamestore.com`)
2. Platform shows DNS instructions: `CNAME mats.mygamestore.com → shops.playmatstudio.com`
3. Platform periodically verifies DNS propagation
4. Once verified, `Shop.customDomain` is marked active

---

### 3. Product Catalog

**Default products per shop (created on registration):**

| Size Key | Label | Dimensions | Base Price |
|---|---|---|---|
| `standard` | Standard Mat | 24" × 14" | $28.00 |
| `expanded` | Expanded Mat | 28" × 16" | $34.00 |
| `extended` | Extended Mat | 28" × 14" | $32.00 |
| `deskmat_s` | Small Deskmat | 31.5" × 11.8" | $36.00 |
| `deskmat_l` | Large Deskmat | 35.4" × 15.7" | $42.00 |

Each product can be toggled active/inactive per shop. Shops set their own retail price (must be ≥ base price + platform fee).

**Pricing formula:**
```
Retail price = Base price × (1 + shop markup %)
Platform fee = Base price (Playmat Studio keeps this)
Shop revenue = Retail price − Platform fee
```

---

### 4. Storefront (Public-Facing)

**Routes under `[shopSlug]/`:**

| Path | Description |
|---|---|
| `/[slug]` | Shop home — hero, active products |
| `/[slug]/design` | Design tool page |
| `/[slug]/cart` | Cart review (single item — one mat per order) |
| `/[slug]/checkout` | Stripe Checkout redirect |
| `/[slug]/order/[id]` | Order confirmation & status |

**Shop home page:**
- Shop logo + name (header)
- Hero text: "Design your custom playmat"
- Grid of active product cards (size, price, "Start Designing" CTA)
- "Powered by Playmat Studio" badge (if TRANSPARENT mode)

**Design page:**
- Full-screen iframe embedding the Playmat Studio editor
- Editor is pre-configured with the selected mat size
- "Add to Cart" button enabled after design is exported
- On export: file uploaded to R2, user proceeds to cart

**Cart page:**
- Mat size, price, design thumbnail
- Shipping address form
- Proceed to checkout button

**Checkout:**
- Stripe Checkout session (redirect)
- On success: order created, confirmation email sent
- On cancel: back to cart

---

### 5. Order Management (Shop Dashboard)

**Order list columns:**
- Order ID (truncated)
- Customer name + email
- Mat size
- Status badge (color-coded)
- Date placed
- Amount paid
- Actions: View, Download design file

**Order detail view:**
- All order fields
- Design file download link (from R2)
- Status update dropdown
- Tracking number input
- Notes field
- Timeline of status changes

**Status flow:**
```
PENDING_PAYMENT → PAID → DESIGN_READY → SENT_TO_PRINT → PRINTED → SHIPPED → DELIVERED
                      ↘ CANCELLED / REFUNDED
```

**Email triggers:**
| Event | Recipient | Email |
|---|---|---|
| Order placed (paid) | Customer | "Your order is confirmed!" |
| Order placed (paid) | Shop admin | "New order received" |
| Status → SHIPPED | Customer | "Your mat is on its way!" with tracking link |
| Status → DELIVERED | Customer | "Your mat has arrived!" |

---

### 6. Platform Admin Panel

Route: `/admin` (separate auth, not shop login)

- List all shops with status, order count, revenue
- Activate / deactivate shops
- Edit base prices globally
- View all orders across shops
- Download all pending print files as ZIP

---

### 7. Editor Integration (Technical Detail)

The existing Playmat Studio editor at `playmatstudio.com` is embedded via iframe.

**Initialization:**
The B2B page sends a `postMessage` to the editor iframe after load to configure it:

```javascript
editorFrame.contentWindow.postMessage({
  type: "B2B_INIT",
  payload: {
    sizeKey: "standard",        // pre-selects mat size
    shopSlug: "my-game-store",  // for branding/tracking
    hideDownload: true,         // suppress direct download
    exportButtonLabel: "Add to Cart"
  }
}, "https://playmatstudio.com");
```

**Export:**
When customer clicks "Add to Cart" in the editor, the editor posts:

```javascript
window.parent.postMessage({
  type: "DESIGN_EXPORT",
  payload: {
    blob: Blob,          // print-ready JPEG at 300 DPI
    filename: String,
    dpi: 300,
    sizeKey: String,
    dimensions: { widthPx: Number, heightPx: Number }
  }
}, "*");
```

The B2B page receives this, uploads the blob to `/api/upload`, stores the R2 URL in session state, and redirects to `/[slug]/cart`.

**Required change to `tool.js` in existing site:**
Add to the export function (search for `canvas.toBlob`):

```javascript
// After blob is created, before triggering download:
if (window !== window.parent) {
  const msg = { type: "DESIGN_EXPORT", payload: { blob, filename, dpi: 300, sizeKey: APP.activeSizeKey } };
  window.parent.postMessage(msg, "*");
  return; // don't trigger download when embedded
}
// existing download code continues...
```

---

### 8. File Storage Strategy

| File Type | R2 Path | TTL | Access |
|---|---|---|---|
| Shop logos | `shops/{shopId}/logo.{ext}` | Permanent | Public |
| Design drafts (pre-purchase) | `drafts/{sessionId}/{filename}` | 24 hours | Private |
| Confirmed order files | `orders/{orderId}/{filename}` | 90 days | Authenticated |
| Print exports | `print/{orderId}/print-ready.jpg` | 90 days | Authenticated |

---

### 9. Stripe Integration

**Basic flow (no Connect):**
1. Customer checks out → server creates `PaymentIntent` with `metadata: { orderId, shopId }`
2. Customer pays via Stripe Checkout
3. Webhook `payment_intent.succeeded` → update order status to PAID

**Connect flow (Phase 4):**
1. Shop admin connects their Stripe account via OAuth (`/api/stripe/connect`)
2. Platform creates `PaymentIntent` with `transfer_data: { destination: shop.stripeAccountId }`
3. Platform fee set as `application_fee_amount`
4. Shop receives their markup automatically

---

## Non-Functional Requirements

### Performance
- Storefront pages: < 2s LCP on 4G mobile
- Editor iframe: loads within 3s (same as existing site)
- R2 upload: < 10s for a 20 MB print file

### Accessibility
- WCAG 2.1 AA on all storefront pages
- Keyboard navigable checkout flow
- Alt text on all product images

### SEO (per storefront)
- `<title>`: `{Shop Name} — Custom Playmats`
- `og:image`: Dynamic OG image with shop logo + mat preview
- `robots.txt` allows indexing of shop storefronts
- `sitemap.xml` per shop

### Uptime
- Storefront + checkout: 99.9% (Vercel SLA)
- Editor: inherits playmatstudio.com uptime

---

## Out of Scope (v1)

- Multiple products in a single order (one mat per checkout)
- Customer accounts / order history portal (Phase 5)
- Subscription/recurring billing for shops
- Physical product inventory (non-playmat items)
- Mobile app
- Multi-language support

---

## Competitive Context

| Competitor | Weakness | Our Advantage |
|---|---|---|
| Printful + Shopify | Generic, no game-specific tooling | Game overlay templates, mat-specific editor |
| Inked Gaming | B2C only, not white-label | LGS-first, shops own their customers |
| Custom Gamemat.eu | EU-only, no design tool | US market, built-in browser design tool |
| ArtsCow | Low quality, no game overlays | Premium quality, game-community trust |

---

## Success Metrics

| Metric | 90-day Target |
|---|---|
| Active shops onboarded | 10 |
| Orders processed | 50 |
| Average order value | $38 |
| Shop NPS | ≥ 8 |
| Order → shipped time | ≤ 10 business days |
