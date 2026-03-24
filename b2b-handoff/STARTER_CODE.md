# Starter Code — Playmat Studio B2B

Copy-paste these files to bootstrap the new project. Run in order.

---

## 1. Initialize Next.js Project

```bash
npx create-next-app@latest playmat-studio-b2b \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

cd playmat-studio-b2b

npm install prisma @prisma/client \
  next-auth@beta \
  @auth/prisma-adapter \
  stripe \
  @aws-sdk/client-s3 \
  resend \
  zod

npm install -D @types/node
```

---

## 2. `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Shop {
  id              String       @id @default(cuid())
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  slug            String       @unique
  name            String
  ownerEmail      String       @unique
  passwordHash    String?
  brandingMode    BrandingMode @default(TRANSPARENT)
  logoUrl         String?
  primaryColor    String       @default("#6830BB")
  accentColor     String       @default("#30BBAD")
  customDomain    String?      @unique
  markupPercent   Float        @default(20.0)
  stripeAccountId String?
  isActive        Boolean      @default(false)
  products        Product[]
  orders          Order[]
  sessions        Session[]
  accounts        Account[]
}

enum BrandingMode {
  WHITE_LABEL
  TRANSPARENT
}

model Product {
  id               String   @id @default(cuid())
  shopId           String
  shop             Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)
  sizeKey          String
  label            String
  widthIn          Float
  heightIn         Float
  basePriceCents   Int
  retailPriceCents Int
  isActive         Boolean  @default(true)
  orders           Order[]
}

model Order {
  id                    String      @id @default(cuid())
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  shopId                String
  shop                  Shop        @relation(fields: [shopId], references: [id])
  productId             String
  product               Product     @relation(fields: [productId], references: [id])
  status                OrderStatus @default(PENDING_PAYMENT)
  customerEmail         String
  customerName          String
  shippingAddress       Json
  designFileUrl         String?
  designFileKey         String?
  stripePaymentIntentId String?
  amountPaidCents       Int?
  trackingNumber        String?
  notes                 String?
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

// NextAuth tables
model Account {
  id                String  @id @default(cuid())
  shopId            String
  shop              Shop    @relation(fields: [shopId], references: [id], onDelete: Cascade)
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  shopId       String
  shop         Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)
  expires      DateTime
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}
```

---

## 3. `src/lib/db.ts`

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["query"] : [] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

---

## 4. `src/lib/auth.ts`

```typescript
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import { db } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Resend({
      from: process.env.EMAIL_FROM!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.shopId = (user as { shopId?: string }).shopId ?? null;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
});
```

---

## 5. `src/lib/r2.ts`

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

export async function deleteFromR2(key: string): Promise<void> {
  await r2.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    })
  );
}
```

---

## 6. `src/lib/stripe.ts`

```typescript
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});
```

---

## 7. `src/lib/theme.ts`

```typescript
import type { Shop } from "@prisma/client";

export function buildThemeVars(shop: Pick<Shop, "primaryColor" | "accentColor">): React.CSSProperties {
  return {
    "--shop-primary": shop.primaryColor,
    "--shop-accent": shop.accentColor,
  } as React.CSSProperties;
}
```

---

## 8. `src/app/[shopSlug]/layout.tsx`

```typescript
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { buildThemeVars } from "@/lib/theme";
import ShopHeader from "@/components/storefront/ShopHeader";

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { shopSlug: string };
}) {
  const shop = await db.shop.findUnique({
    where: { slug: params.shopSlug, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      brandingMode: true,
    },
  });

  if (!shop) notFound();

  return (
    <div style={buildThemeVars(shop)}>
      <ShopHeader shop={shop} />
      <main>{children}</main>
      {shop.brandingMode === "TRANSPARENT" && (
        <div className="fixed bottom-3 right-3 text-xs opacity-50">
          Powered by{" "}
          <a href="https://playmatstudio.com" target="_blank" rel="noopener noreferrer">
            Playmat Studio
          </a>
        </div>
      )}
    </div>
  );
}
```

---

## 9. `src/app/[shopSlug]/design/page.tsx`

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const EDITOR_ORIGIN = process.env.NEXT_PUBLIC_EDITOR_ORIGIN ?? "https://playmatstudio.com";

interface DesignExportPayload {
  blob: Blob;
  filename: string;
  dpi: number;
  sizeKey: string;
}

export default function DesignPage({
  params,
  searchParams,
}: {
  params: { shopSlug: string };
  searchParams: { size?: string };
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const sizeKey = searchParams.size ?? "standard";

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onLoad = () => {
      iframe.contentWindow?.postMessage(
        {
          type: "B2B_INIT",
          payload: { sizeKey, shopSlug: params.shopSlug, hideDownload: true, exportButtonLabel: "Add to Cart" },
        },
        EDITOR_ORIGIN
      );
    };

    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [sizeKey, params.shopSlug]);

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.origin !== EDITOR_ORIGIN) return;
      if (event.data?.type !== "DESIGN_EXPORT") return;

      setIsExporting(true);
      const { blob, filename, sizeKey: exportedSizeKey } = event.data.payload as DesignExportPayload;

      const formData = new FormData();
      formData.append("file", blob, filename);
      formData.append("shopSlug", params.shopSlug);
      formData.append("sizeKey", exportedSizeKey);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const { fileUrl, fileKey } = await res.json();

      // Store in sessionStorage for cart page
      sessionStorage.setItem(
        "pendingDesign",
        JSON.stringify({ fileUrl, fileKey, sizeKey: exportedSizeKey, filename })
      );

      router.push(`/${params.shopSlug}/cart`);
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [params.shopSlug, router]);

  return (
    <div className="relative h-screen w-full">
      <iframe
        ref={iframeRef}
        src={`${EDITOR_ORIGIN}?embed=1&size=${sizeKey}`}
        className="h-full w-full border-0"
        title="Playmat Design Tool"
        allow="clipboard-write"
      />
      {isExporting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <p className="text-white text-lg">Saving your design...</p>
        </div>
      )}
    </div>
  );
}
```

---

## 10. `src/app/api/upload/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { nanoid } from "nanoid"; // npm install nanoid

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const shopSlug = formData.get("shopSlug") as string | null;

  if (!file || !shopSlug) {
    return NextResponse.json({ error: "Missing file or shopSlug" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }

  const ext = file.type.split("/")[1];
  const id = nanoid(16);
  const key = `drafts/${shopSlug}/${id}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileUrl = await uploadToR2(key, buffer, file.type);

  return NextResponse.json({ fileUrl, fileKey: key });
}
```

---

## 11. `src/app/api/orders/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

const CreateOrderSchema = z.object({
  shopSlug: z.string(),
  productId: z.string(),
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email(),
  shippingAddress: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string().default("US"),
  }),
  designFileUrl: z.string().url(),
  designFileKey: z.string(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { shopSlug, productId, customerName, customerEmail, shippingAddress, designFileUrl, designFileKey } =
    parsed.data;

  const shop = await db.shop.findUnique({ where: { slug: shopSlug, isActive: true } });
  if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

  const product = await db.product.findFirst({
    where: { id: productId, shopId: shop.id, isActive: true },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const order = await db.order.create({
    data: {
      shopId: shop.id,
      productId: product.id,
      customerName,
      customerEmail,
      shippingAddress,
      designFileUrl,
      designFileKey,
      status: "PENDING_PAYMENT",
    },
  });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `${product.label} — ${shop.name}` },
          unit_amount: product.retailPriceCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.NEXTAUTH_URL}/${shopSlug}/order/${order.id}?success=1`,
    cancel_url: `${process.env.NEXTAUTH_URL}/${shopSlug}/cart`,
    metadata: { orderId: order.id, shopId: shop.id },
    customer_email: customerEmail,
  });

  return NextResponse.json({ checkoutUrl: session.url });
}
```

---

## 12. `src/app/api/stripe/webhook/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { orderId } = session.metadata ?? {};

    if (orderId) {
      await db.order.update({
        where: { id: orderId },
        data: {
          status: "PAID",
          stripePaymentIntentId: session.payment_intent as string,
          amountPaidCents: session.amount_total ?? undefined,
        },
      });
      // TODO: send confirmation emails via Resend
    }
  }

  return NextResponse.json({ ok: true });
}
```

---

## 13. `.env.local.example`

```bash
# Database (Neon or any Postgres)
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"

# NextAuth
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Cloudflare R2
R2_ACCOUNT_ID="your-account-id"
R2_ACCESS_KEY_ID="your-key-id"
R2_SECRET_ACCESS_KEY="your-secret"
R2_BUCKET_NAME="playmat-studio-b2b-orders"
R2_PUBLIC_URL="https://files.playmatstudio.com"

# Resend
RESEND_API_KEY="re_..."
EMAIL_FROM="orders@playmatstudio.com"

# Existing Playmat Studio editor
NEXT_PUBLIC_EDITOR_ORIGIN="https://playmatstudio.com"
```

---

## 14. First Migration

```bash
# Generate Prisma client
npx prisma generate

# Push schema to DB (dev only — use migrate for production)
npx prisma db push

# Or use migrations:
npx prisma migrate dev --name init
```

---

## 15. Seed Script (`prisma/seed.ts`)

```typescript
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const MAT_SIZES = [
  { sizeKey: "standard", label: "Standard Mat (24×14)", widthIn: 24, heightIn: 14, basePriceCents: 2800 },
  { sizeKey: "expanded", label: "Expanded Mat (28×16)", widthIn: 28, heightIn: 16, basePriceCents: 3400 },
  { sizeKey: "extended", label: "Extended Mat (28×14)", widthIn: 28, heightIn: 14, basePriceCents: 3200 },
];

async function main() {
  // Create a demo shop
  const shop = await db.shop.upsert({
    where: { slug: "demo-store" },
    update: {},
    create: {
      slug: "demo-store",
      name: "Demo Game Store",
      ownerEmail: "demo@example.com",
      isActive: true,
      brandingMode: "TRANSPARENT",
    },
  });

  // Create products for demo shop
  for (const size of MAT_SIZES) {
    await db.product.upsert({
      where: { id: `${shop.id}-${size.sizeKey}` },
      update: {},
      create: {
        id: `${shop.id}-${size.sizeKey}`,
        shopId: shop.id,
        ...size,
        retailPriceCents: Math.ceil(size.basePriceCents * 1.2), // 20% markup
        isActive: true,
      },
    });
  }

  console.log("Seeded demo shop:", shop.slug);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
```

Add to `package.json`:
```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
}
```

Run: `npx prisma db seed`
