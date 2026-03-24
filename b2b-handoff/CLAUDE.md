# CLAUDE.md — Playmat Studio B2B Platform

This file is the master context document for Claude Code. Read this fully before writing any code or making any decisions.

---

## Project Overview

**Playmat Studio B2B** is a white-label storefront platform that lets game shops (LGS — Local Game Stores) offer custom playmat design and purchasing to their customers, powered by Playmat Studio's existing design tooling.

### Business Model

- **Playmat Studio** is the platform operator and print fulfillment coordinator.
- **Game shops** are tenants. Each shop gets a branded storefront (subdomain or custom domain).
- **End customers** are the shops' players/customers. They design playmats, check out through the shop's storefront, and receive printed mats.
- Shops earn a configurable markup on each order. Playmat Studio handles fulfillment coordination with the print vendor.

### Two Branding Modes (per shop setting)

| Mode | Description |
|---|---|
| **White Label** | Shop's logo, name, colors only. "Powered by Playmat Studio" is hidden. |
| **Transparent** | Shop's branding is primary, but "Powered by Playmat Studio" badge is shown. |

---

## Source Context: Existing Playmat Studio Site

The existing site lives at `github.com/salve-hue/Playmat-Studio-Website` and is deployed to `playmatstudio.com`. It is a **static single-page app** built with:

- jQuery 3.x + Fabric.js 5.3.1 for canvas editing
- GitHub Pages for hosting
- Cloudflare Workers for backend (contact form, image hosting, AI upscaling/background removal)
- Cloudflare R2 for file storage

### Reusable Assets From Existing Site

- **Canvas editor logic** (`assets/js/tool.js`, 2873 lines) — the entire design tool. This B2B platform should embed it or reference it, not rewrite it.
- **Cloudflare Workers** — `playmat-host-worker.js` for R2 file uploads; AI workers at `playmat-upscaler.salve.workers.dev` and `playmat-removebg.salve.workers.dev`.
- **CSS design tokens** — colors, fonts, spacing defined in `assets/css/custom.css`.
- **48+ game overlay templates** stored in Cloudflare R2.
- **Mat size database** — Standard (24"×14"), Expanded (28"×16"), Extended (28"×14"), and 6 deskmat sizes.

**Do not rewrite the canvas editor.** Integrate it via iframe or by extracting and adapting `tool.js` into the new frontend.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR for shop storefronts, easy API routes |
| Styling | Tailwind CSS + CSS Variables | Enables per-shop theme injection |
| Database | PostgreSQL via Prisma ORM | Relational data, strong typing |
| DB Hosting | Neon (serverless Postgres) | Free tier, edge-compatible |
| Auth | NextAuth.js v5 (Auth.js) | Shop admin login; supports magic link + OAuth |
| Payments | Stripe | Checkout, webhooks, connect for shop payouts |
| File Storage | Cloudflare R2 (existing bucket reuse) | Already set up, 7-day TTL for drafts |
| Email | Resend (existing account reuse) | Transactional emails |
| Deployment | Vercel | Next.js-native, edge functions |
| Canvas Editor | Fabric.js (embedded from existing tool) | Reuse `tool.js` via iframe or module |

---

## Repository Structure

```
playmat-studio-b2b/
├── CLAUDE.md                         # ← this file
├── PROJECT_SPEC.md                   # Full feature specification
├── .env.local.example                # Environment variables template
├── prisma/
│   ├── schema.prisma                 # Database models
│   └── migrations/                   # Migration history
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Marketing landing page (platform homepage)
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx         # Shop registration
│   ├── dashboard/                    # Shop admin (authenticated)
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Dashboard home / order overview
│   │   ├── orders/page.tsx
│   │   ├── products/page.tsx         # Mat size + pricing config
│   │   ├── branding/page.tsx         # Logo, colors, domain, branding mode
│   │   └── settings/page.tsx
│   ├── [shopSlug]/                   # Public shop storefront (white-labeled)
│   │   ├── layout.tsx                # Injects shop theme tokens
│   │   ├── page.tsx                  # Shop home / product listing
│   │   ├── design/page.tsx           # Design tool (embedded editor)
│   │   ├── cart/page.tsx
│   │   └── checkout/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── shops/route.ts            # Shop CRUD
│       ├── products/route.ts         # Product catalog
│       ├── orders/route.ts           # Order management
│       ├── stripe/webhook/route.ts   # Payment events
│       └── upload/route.ts           # Design file upload to R2
├── components/
│   ├── editor/
│   │   ├── EditorEmbed.tsx           # Iframe wrapper for the canvas tool
│   │   └── EditorBridge.tsx          # postMessage bridge to/from editor
│   ├── storefront/
│   │   ├── ShopHeader.tsx
│   │   ├── ProductCard.tsx
│   │   └── ThemeProvider.tsx         # Injects --shop-* CSS variables
│   ├── dashboard/
│   │   ├── OrderTable.tsx
│   │   ├── BrandingForm.tsx
│   │   └── PricingConfig.tsx
│   └── ui/                           # Shared primitive components
├── lib/
│   ├── db.ts                         # Prisma client singleton
│   ├── auth.ts                       # NextAuth config
│   ├── stripe.ts                     # Stripe client
│   ├── r2.ts                         # Cloudflare R2 client (S3-compatible)
│   ├── resend.ts                     # Email client
│   └── theme.ts                      # Shop theme token builder
├── middleware.ts                     # Auth guards + shop slug routing
└── types/
    └── index.ts                      # Shared TypeScript types
```

---

## Database Schema (Prisma)

```prisma
model Shop {
  id            String   @id @default(cuid())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  slug          String   @unique           // URL slug: playmatstudio.com/[slug]
  name          String
  ownerEmail    String   @unique
  passwordHash  String?
  // Branding
  brandingMode  BrandingMode @default(TRANSPARENT)
  logoUrl       String?
  primaryColor  String   @default("#6830BB")
  accentColor   String   @default("#30BBAD")
  customDomain  String?  @unique           // e.g. mats.mygamestore.com
  // Business
  markupPercent Float    @default(20.0)    // Shop's margin on base price
  stripeAccountId String?                  // Stripe Connect account
  isActive      Boolean  @default(true)
  // Relations
  products      Product[]
  orders        Order[]
}

enum BrandingMode {
  WHITE_LABEL
  TRANSPARENT
}

model Product {
  id          String   @id @default(cuid())
  shopId      String
  shop        Shop     @relation(fields: [shopId], references: [id])
  sizeKey     String                        // e.g. "standard", "expanded"
  label       String                        // Display name
  widthIn     Float
  heightIn    Float
  basePriceCents Int                        // Playmat Studio base cost
  retailPriceCents Int                      // shopMarkup applied
  isActive    Boolean  @default(true)
  orders      Order[]
}

model Order {
  id              String      @id @default(cuid())
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  shopId          String
  shop            Shop        @relation(fields: [shopId], references: [id])
  productId       String
  product         Product     @relation(fields: [productId], references: [id])
  status          OrderStatus @default(PENDING_PAYMENT)
  // Customer info
  customerEmail   String
  customerName    String
  shippingAddress Json                      // { line1, line2, city, state, zip, country }
  // Design
  designFileUrl   String?                   // R2 URL of print-ready file
  designFileKey   String?                   // R2 key for cleanup
  // Payment
  stripePaymentIntentId String?
  amountPaidCents       Int?
  // Fulfillment
  trackingNumber  String?
  notes           String?
}

enum OrderStatus {
  PENDING_PAYMENT
  PAID
  DESIGN_READY
  SENT_TO_PRINT
  PRINTED
  SHIPPED
  DELIVERED
  CANCELLED
  REFUNDED
}
```

---

## Key Implementation Details

### 1. Shop Storefront Routing

Each shop is accessed at `playmatstudio.com/[shopSlug]` or their custom domain. Middleware handles both:

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host");
  const shopDomain = await findShopByCustomDomain(hostname);
  if (shopDomain) {
    // Rewrite custom domain to /[shopSlug] internally
    return NextResponse.rewrite(new URL(`/${shopDomain.slug}${pathname}`, request.url));
  }
}
```

### 2. Theme Injection

Shop branding tokens are injected server-side into the storefront layout:

```typescript
// app/[shopSlug]/layout.tsx
export default async function ShopLayout({ params }) {
  const shop = await getShopBySlug(params.shopSlug);
  const themeVars = buildThemeVars(shop); // returns CSS variable string
  return (
    <html style={themeVars}>
      <body>
        {shop.brandingMode === 'TRANSPARENT' && <PoweredByBadge />}
        {children}
      </body>
    </html>
  );
}
```

```typescript
// lib/theme.ts
export function buildThemeVars(shop: Shop): Record<string, string> {
  return {
    "--shop-primary": shop.primaryColor,
    "--shop-accent": shop.accentColor,
    "--shop-name": `"${shop.name}"`,
  };
}
```

### 3. Editor Integration

The existing Playmat Studio canvas editor is embedded as an iframe. After the customer finalizes their design, the editor posts a message with the print-ready file blob.

```typescript
// components/editor/EditorBridge.tsx
useEffect(() => {
  const handler = (event: MessageEvent) => {
    if (event.data.type === "DESIGN_EXPORT") {
      // event.data.payload: { blob: Blob, filename: string, dpi: number }
      handleDesignReady(event.data.payload);
    }
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}, []);
```

The existing `tool.js` needs a small addition to post the export message instead of (or in addition to) triggering a browser download when embedded. Add a check:

```javascript
// In tool.js export function, after building the blob:
if (window.parent !== window) {
  window.parent.postMessage({ type: "DESIGN_EXPORT", payload: { blob, filename, dpi: 300 } }, "*");
} else {
  // existing download logic
}
```

### 4. Order Checkout Flow

```
Customer designs mat
  → clicks "Add to Cart"
  → EditorBridge receives DESIGN_EXPORT
  → /api/upload saves file to R2, returns URL
  → Stripe Checkout Session created (with shop's Stripe Connect account)
  → Customer completes payment
  → /api/stripe/webhook receives `payment_intent.succeeded`
  → Order status updated to PAID
  → Email sent to shop admin + customer
  → Shop admin marks as SENT_TO_PRINT, uploads tracking
```

### 5. Pricing Logic

```typescript
// lib/pricing.ts
export function calculateRetailPrice(baseCents: number, markupPercent: number): number {
  return Math.ceil(baseCents * (1 + markupPercent / 100));
}
```

Base prices (starting points — confirm with print vendor):
- Standard 24"×14": $28.00
- Expanded 28"×16": $34.00
- Extended 28"×14": $32.00

### 6. Environment Variables

```bash
# .env.local
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://playmatstudio.com

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=playmat-studio-b2b-orders
R2_PUBLIC_URL=https://files.playmatstudio.com

RESEND_API_KEY=re_...
EMAIL_FROM=orders@playmatstudio.com

EDITOR_ORIGIN=https://playmatstudio.com   # Existing site used as editor source
```

---

## Implementation Phases

### Phase 1 — Foundation (MVP)
- [ ] Next.js project scaffold with TypeScript + Tailwind
- [ ] Prisma schema + Neon DB setup
- [ ] NextAuth shop admin login (magic link email)
- [ ] Shop registration form → create Shop record
- [ ] Basic dashboard: order list, branding config
- [ ] `[shopSlug]` storefront: product listing page
- [ ] Editor embed page (iframe pointing to existing playmatstudio.com)
- [ ] EditorBridge postMessage integration
- [ ] R2 upload API route
- [ ] Stripe Checkout (basic, no Connect yet)
- [ ] Order creation on webhook
- [ ] Transactional emails: order confirmation to customer + shop

### Phase 2 — White Labeling
- [ ] Per-shop theme token injection (CSS variables)
- [ ] Logo upload + storage in R2
- [ ] Custom domain middleware (CNAME instructions for shops)
- [ ] Branding mode toggle (WHITE_LABEL vs TRANSPARENT)
- [ ] Storefront header/footer with shop branding

### Phase 3 — Shop Operations
- [ ] Order management UI (status updates, tracking number entry)
- [ ] Product catalog management (enable/disable sizes, set prices)
- [ ] Shop analytics: revenue, order counts, popular sizes
- [ ] Print-ready file download for shop/fulfillment

### Phase 4 — Payments & Payouts
- [ ] Stripe Connect for shop payouts (platform takes fee, shop gets markup)
- [ ] Refund flow
- [ ] Invoice generation

### Phase 5 — Polish
- [ ] Customer accounts (order history, reorder)
- [ ] Discount codes (shop-level)
- [ ] Bulk order discounts
- [ ] Email templates branded per shop
- [ ] SEO: per-shop `og:image`, metadata

---

## Design Guidelines

Reuse the existing Playmat Studio design tokens as the platform base, then override per shop:

```css
/* Platform base (from existing site) */
--ps-bg: #0b0912;
--ps-surface: #110e1c;
--ps-purple: #6830BB;
--ps-teal: #30BBAD;
--ps-text: #f0eeff;

/* Shop overrides (injected dynamically) */
--shop-primary: var(--ps-purple);   /* defaults to PS purple */
--shop-accent: var(--ps-teal);
```

All storefront components should use `--shop-primary` and `--shop-accent`, not the platform tokens directly.

---

## Security Requirements

- All API routes that mutate data require authenticated session (NextAuth)
- Shop admins can only access their own shop's data — enforce `shopId === session.user.shopId` on every DB query
- Design file uploads: validate MIME type and file size (max 50 MB) server-side before writing to R2
- Stripe webhook: verify `stripe-signature` header before processing
- No `innerHTML` with user content — use React's safe rendering
- CSP headers on all responses (Next.js `next.config.js` headers config)

---

## Getting Started (for Claude)

When starting a new session on this project:

1. Read `PROJECT_SPEC.md` for full feature details and open questions.
2. Check `prisma/schema.prisma` for current DB state.
3. Run `npx prisma studio` to inspect data visually.
4. Check `app/api/` for existing routes before adding new ones.
5. All new components go in `components/` with clear subdirectory.
6. Run `npm run dev` and verify no TypeScript errors before committing.
7. Each PR should include a migration if schema changed.

### Bootstrap Commands

```bash
# Clone and install
git clone https://github.com/salve-hue/playmat-studio-b2b.git
cd playmat-studio-b2b
npm install

# DB setup
npx prisma generate
npx prisma db push

# Dev server
npm run dev
```

---

## Open Questions (Resolve Before Building)

1. **Print Vendor**: Who is the print vendor? Do they have an API, or is fulfillment manual (shop downloads file, sends to vendor themselves)?
2. **Stripe Connect**: Does each shop need their own Stripe account (Connect), or does Playmat Studio collect all payments and pay shops out manually?
3. **Editor Hosting**: Should the B2B platform host its own copy of the editor, or always iframe from `playmatstudio.com`? Iframing is simpler but couples the two sites.
4. **Shop Approval**: Should new shop registrations require manual approval, or auto-activate?
5. **Custom Domains**: Is CNAME-based custom domain support required in Phase 1, or can shops use `playmatstudio.com/[slug]` initially?
6. **Mat Materials**: Is there a single material (rubber), or will shops offer material options (rubber, cloth, neoprene)?
