# Accounts And Personal Product Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase magic-link authentication, private user-owned products, safe URL onboarding, shared retailer listings, manual refresh, and twice-daily scheduled refresh.

**Architecture:** Supabase Auth supplies verified users and session IDs, while Prisma remains the only application-data layer. Private `TrackedProduct` rows join shared `RetailerListing` rows so identical URLs are scraped once and price snapshots are reusable without exposing one user's collection to another.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma 5, Supabase Auth SSR, Postgres, Playwright, Vitest, Testing Library, GitHub Actions

---

## File Structure

### Authentication

- Create `src/lib/supabase/client.ts`: browser Supabase client.
- Create `src/lib/supabase/server.ts`: cookie-aware server Supabase client.
- Create `src/lib/auth/session.ts`: verified user plus app-session enforcement.
- Create `src/lib/auth/login-intents.ts`: one-time 24-hour/30-day login choices.
- Create `src/app/login/page.tsx`: signed-out login UI.
- Create `src/app/login/login-form.tsx`: magic-link client form.
- Create `src/app/auth/callback/route.ts`: PKCE callback and `AppSession` creation.
- Create `src/app/auth/signout/route.ts`: current-session sign out.
- Create `middleware.ts`: refresh Supabase cookies and gate protected routes.

### Product Ownership

- Modify `prisma/schema.prisma`: add profiles, sessions, private products, joins, attempts; decouple listings from canonical products.
- Create `prisma/migrations/20260611143000_add_multi_user_products/migration.sql`: additive schema migration.
- Create `prisma/migrations/20260611150000_remove_canonical_products/migration.sql`: cleanup migration created only after verified legacy backfill.
- Create `src/lib/products/queries.ts`: owner-scoped product reads.
- Create `src/lib/products/mutations.ts`: create, edit, attach, detach, delete transactions.
- Create `src/lib/products/url-policy.ts`: exact URL allowlist and canonicalization.
- Create `src/lib/products/preview.ts`: safe fetch and parsed preview orchestration.
- Create `src/lib/products/identity.ts`: strict normalized identity comparison.

### Refresh

- Refactor `src/lib/pricing/live-prices.ts`: refresh shared listings from database rows.
- Refactor `src/lib/pricing/refresh-prices.ts`: listing locks, attempts, and snapshots.
- Refactor `src/lib/pricing/cached-prices.ts`: owner-scoped tracked-product reads.
- Modify `src/app/api/prices/refresh/route.ts`: authenticated owner-scoped manual refresh.
- Create `src/lib/pricing/scheduled-refresh.ts`: distinct active listing batch.
- Modify `src/lib/scraping/run-scrape.ts`: call scheduled shared-listing refresh.
- Modify `.github/workflows/scheduled-scrape.yml`: enable midnight/noon SGT schedule.

### UI

- Refactor `src/app/page.tsx`, `src/app/products/page.tsx`, and `src/app/products/[slug]/page.tsx`.
- Create `src/app/products/new/page.tsx` and focused form components.
- Create `src/app/products/[slug]/edit/page.tsx`.
- Create `src/app/account/page.tsx`.
- Modify `src/app/layout.tsx`, `src/app/globals.css`, and `tailwind.config.ts`.

## Task 1: Install Supabase SSR And Define Environment Contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Create: `src/lib/env.ts`
- Test: `tests/env.test.ts`

- [ ] **Step 1: Write the failing environment test**

```ts
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

describe("server environment", () => {
  it("requires Supabase auth and legacy owner settings", () => {
    expect(() => parseServerEnv({})).toThrow("NEXT_PUBLIC_SUPABASE_URL");
    expect(
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://axmooodckwmazabgitkv.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        LEGACY_OWNER_EMAIL: "owner@example.com"
      })
    ).toMatchObject({ legacyOwnerEmail: "owner@example.com" });
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `npx vitest run tests/env.test.ts`

Expected: FAIL because `src/lib/env.ts` does not exist.

- [ ] **Step 3: Install the auth packages**

Run:

```bash
npm install @supabase/ssr @supabase/supabase-js
```

Expected: `package.json` and `package-lock.json` include both packages.

- [ ] **Step 4: Implement typed environment parsing**

```ts
import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  LEGACY_OWNER_EMAIL: z.string().email()
});

export function parseServerEnv(input: Record<string, string | undefined>) {
  const value = serverEnvSchema.parse(input);
  return {
    supabaseUrl: value.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    legacyOwnerEmail: value.LEGACY_OWNER_EMAIL.toLowerCase()
  };
}
```

Add these names to `.env.example` without real secret values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL="https://axmooodckwmazabgitkv.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=""
LEGACY_OWNER_EMAIL=""
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/env.test.ts`

Expected: PASS.

```bash
git add package.json package-lock.json .env.example src/lib/env.ts tests/env.test.ts
git commit -m "chore: add Supabase auth dependencies"
```

## Task 2: Add Multi-User Prisma Models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260611143000_add_multi_user_products/migration.sql`
- Test: `tests/schema-contract.test.ts`

- [ ] **Step 1: Write a schema contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

describe("multi-user schema", () => {
  it("defines private products joined to shared listings", () => {
    expect(schema).toContain("model UserProfile");
    expect(schema).toContain("model AppSession");
    expect(schema).toContain("model LoginIntent");
    expect(schema).toContain("model TrackedProduct");
    expect(schema).toContain("model TrackedProductListing");
    expect(schema).toContain("model ScrapeAttempt");
    expect(schema).toContain("canonicalProduct CanonicalProduct?");
  });
});
```

- [ ] **Step 2: Run the contract test**

Run: `npx vitest run tests/schema-contract.test.ts`

Expected: FAIL because the models are absent.

- [ ] **Step 3: Replace the ownership portion of the Prisma schema**

Add:

```prisma
enum AppSessionDuration {
  ONE_DAY
  THIRTY_DAYS
}

enum ScrapeTrigger {
  ONBOARDING
  MANUAL
  SCHEDULED
}

enum ScrapeAttemptStatus {
  STARTED
  COMPLETED
  FAILED
  BLOCKED
}

model UserProfile {
  id             String           @id @default(cuid())
  supabaseUserId String           @unique @db.Uuid
  email          String           @unique
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  products       TrackedProduct[]
  sessions       AppSession[]
}

model LoginIntent {
  id        String             @id @default(cuid())
  nonceHash String             @unique
  duration  AppSessionDuration
  expiresAt DateTime
  consumedAt DateTime?
  createdAt DateTime           @default(now())
  @@index([expiresAt])
}

model AppSession {
  id                String      @id @default(cuid())
  profileId         String
  supabaseSessionId String      @unique @db.Uuid
  expiresAt         DateTime
  createdAt         DateTime    @default(now())
  profile           UserProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  @@index([profileId, expiresAt])
}

model TrackedProduct {
  id         String                  @id @default(cuid())
  ownerId    String
  slug       String
  name       String
  brand      String
  family     String
  flavour    String?
  packCount  Int
  unitSize   Float
  unit       String
  totalSize  Float
  imageUrl   String?
  isActive   Boolean                 @default(true)
  createdAt  DateTime                @default(now())
  updatedAt  DateTime                @updatedAt
  owner      UserProfile             @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  listings   TrackedProductListing[]
  @@unique([ownerId, slug])
  @@index([ownerId, isActive])
}

model TrackedProductListing {
  id                 String          @id @default(cuid())
  trackedProductId   String
  retailerListingId  String
  retailerId         String
  createdAt          DateTime        @default(now())
  trackedProduct     TrackedProduct  @relation(fields: [trackedProductId], references: [id], onDelete: Cascade)
  retailerListing    RetailerListing @relation(fields: [retailerListingId], references: [id], onDelete: Restrict)
  retailer           Retailer        @relation(fields: [retailerId], references: [id], onDelete: Restrict)
  @@unique([trackedProductId, retailerId])
  @@unique([trackedProductId, retailerListingId])
  @@index([retailerListingId])
}

model ScrapeAttempt {
  id                String              @id @default(cuid())
  retailerListingId String
  trigger           ScrapeTrigger
  status            ScrapeAttemptStatus @default(STARTED)
  errorCategory     String?
  errorMessage      String?
  snapshotStored    Boolean             @default(false)
  startedAt         DateTime            @default(now())
  completedAt       DateTime?
  retailerListing   RetailerListing     @relation(fields: [retailerListingId], references: [id], onDelete: Cascade)
  @@index([retailerListingId, startedAt])
}
```

Add relations on `Retailer` and `RetailerListing`. Keep
`RetailerListing.canonicalProductId`, its relation, and `CanonicalProduct`
during this additive migration so existing production data remains readable
until the owner backfill is verified.

- [ ] **Step 4: Write the migration SQL in safe order**

The migration must:

1. Create new enums and tables.
2. Add indexes and foreign keys.
3. Leave `CanonicalProduct` and its listing FK in place.
4. Do not alter existing product rows or listing ownership.

Do not run this migration against production yet.

- [ ] **Step 5: Validate and commit**

Run:

```bash
npx prisma format
npx prisma validate
npx vitest run tests/schema-contract.test.ts
```

Expected: all pass.

```bash
git add prisma/schema.prisma prisma/migrations tests/schema-contract.test.ts
git commit -m "feat: add multi-user product schema"
```

## Task 3: Implement Supabase Clients And Session Verification

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/auth/session.ts`
- Test: `tests/auth-session.test.ts`

- [ ] **Step 1: Write failing session tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { requireAppSession } from "@/lib/auth/session";

describe("requireAppSession", () => {
  it("rejects an expired application session", async () => {
    const signOut = vi.fn();
    await expect(
      requireAppSession({
        now: new Date("2026-06-11T00:00:00Z"),
        auth: { getUser: async () => ({ user: { id: "u1", email: "a@b.com" }, sessionId: "s1" }), signOut },
        db: { findSession: async () => ({ expiresAt: new Date("2026-06-10T00:00:00Z") }) }
      })
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `npx vitest run tests/auth-session.test.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Create browser and server Supabase factories**

Use `createBrowserClient` in `client.ts` and `createServerClient` with
`cookies()` get/set adapters in `server.ts`. Read only the public Supabase URL
and publishable key.

- [ ] **Step 4: Implement verified app-session enforcement**

`requireAppSession()` must call Supabase `getUser()`, decode only the verified
JWT returned by Supabase to obtain `session_id`, upsert `UserProfile`, then
query `AppSession` by `supabaseSessionId`. Return:

```ts
type AuthContext = {
  profileId: string;
  supabaseUserId: string;
  email: string;
  supabaseSessionId: string;
};
```

Throw typed errors for missing, expired, or invalid sessions. Never trust
client-supplied user or profile IDs.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/auth-session.test.ts`

Expected: PASS.

```bash
git add src/lib/supabase src/lib/auth/session.ts tests/auth-session.test.ts
git commit -m "feat: enforce authenticated app sessions"
```

## Task 4: Implement Login Intents, Magic Link Callback, And Sign Out

**Files:**
- Create: `src/lib/auth/login-intents.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/login-form.tsx`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/auth/signout/route.ts`
- Create: `middleware.ts`
- Test: `tests/login-intents.test.ts`
- Test: `tests/auth-routes.test.ts`

- [ ] **Step 1: Write one-time intent tests**

```ts
it("consumes a 30-day login intent only once", async () => {
  const created = await createLoginIntent(fakeDb, "THIRTY_DAYS", now);
  await expect(consumeLoginIntent(fakeDb, created.nonce, now)).resolves.toMatchObject({
    duration: "THIRTY_DAYS"
  });
  await expect(consumeLoginIntent(fakeDb, created.nonce, now)).rejects.toMatchObject({
    code: "LOGIN_INTENT_INVALID"
  });
});
```

- [ ] **Step 2: Run the focused tests**

Run: `npx vitest run tests/login-intents.test.ts tests/auth-routes.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement hashed login intents**

Generate 32 random bytes, return the base64url nonce once, and store only
`sha256(nonce)`. Expire intents after 15 minutes and atomically set
`consumedAt`.

- [ ] **Step 4: Implement login and callback**

The login form posts email plus checkbox. Call `signInWithOtp()` with:

```ts
options: {
  emailRedirectTo: `${origin}/auth/callback?intent=${encodeURIComponent(nonce)}`
}
```

The callback exchanges `code`, consumes the intent, verifies the user/session,
and creates `AppSession.expiresAt` using exactly 24 hours or 30 days.

- [ ] **Step 5: Implement route gating and local sign out**

Middleware refreshes Supabase cookies. Protected pages call
`requireAppSession()` at the server boundary. The signout route calls
`supabase.auth.signOut({ scope: "local" })`, deletes the matching `AppSession`,
and redirects to `/login`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx vitest run tests/login-intents.test.ts tests/auth-routes.test.ts
npm run typecheck
```

Expected: PASS.

```bash
git add src/lib/auth/login-intents.ts src/app/login src/app/auth middleware.ts tests/login-intents.test.ts tests/auth-routes.test.ts
git commit -m "feat: add magic-link login flow"
```

## Task 5: Add Safe Product URL Policy

**Files:**
- Create: `src/lib/products/url-policy.ts`
- Modify: `src/lib/scraping/http.ts`
- Test: `tests/product-url-policy.test.ts`

- [ ] **Step 1: Write allowlist tests**

Cover accepted FairPrice, Cold Storage, and Lazada product URLs plus rejected
HTTP, credentials, fragments, custom ports, IP hosts, search pages, unsupported
subdomains, and cross-host redirects.

```ts
expect(parseSupportedProductUrl("https://www.fairprice.com.sg/product/13142563"))
  .toMatchObject({ retailerSlug: "fairprice" });
expect(() => parseSupportedProductUrl("http://127.0.0.1/admin")).toThrow("UNSUPPORTED_URL");
expect(() => parseSupportedProductUrl("https://www.fairprice.com.sg/search?query=milk"))
  .toThrow("UNSUPPORTED_URL");
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/product-url-policy.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement exact host/path validation**

Return:

```ts
type SupportedProductUrl = {
  retailerSlug: "fairprice" | "cold-storage" | "redmart";
  canonicalUrl: string;
};
```

Normalize host case, remove fragments, sort or remove non-identity query
parameters, and preserve RedMart item/SKU identity. Do not accept search URLs.

- [ ] **Step 4: Make HTTP redirects explicit**

Change `fetchRetailerPage()` to `redirect: "manual"`. Add a helper that follows
at most two redirects only after re-validating each destination against the
same retailer policy.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/product-url-policy.test.ts`

Expected: PASS.

```bash
git add src/lib/products/url-policy.ts src/lib/scraping/http.ts tests/product-url-policy.test.ts
git commit -m "feat: validate supported product URLs"
```

## Task 6: Build Product Preview And Identity Matching

**Files:**
- Create: `src/lib/products/preview.ts`
- Create: `src/lib/products/identity.ts`
- Modify: `src/lib/scraping/product-page-types.ts`
- Test: `tests/product-preview.test.ts`
- Test: `tests/product-identity.test.ts`

- [ ] **Step 1: Write preview and mismatch tests**

Test that preview requires positive price, title, brand, and parseable pack
size. Test exact compatible identity and rejection of brand, unit, or total
size mismatches.

```ts
expect(compareProductIdentity(
  { brand: "Magnum", packCount: 6, totalSize: 330, unit: "ml" },
  { brand: "magnum", packCount: 6, totalSize: 330, unit: "ml" }
)).toEqual({ compatible: true });
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/product-preview.test.ts tests/product-identity.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement normalized preview output**

```ts
type ProductPreview = {
  retailerSlug: RetailerSlug;
  canonicalUrl: string;
  retailerSku?: string;
  titleRaw: string;
  name: string;
  brand: string;
  family: string;
  flavour: string | null;
  packCount: number;
  unitSize: number;
  unit: string;
  totalSize: number;
  imageUrl: string | null;
  price: number;
  originalPrice: number | null;
  promotionText: string | null;
  isAvailable: boolean;
};
```

Map parser failures to stable categories without returning raw HTML.

- [ ] **Step 4: Implement strict identity comparison**

Normalize case and spacing. Require equal brand, unit, pack count, and total
size within a 0.5% numeric tolerance. Return conflicting field names and values
for the UI.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/product-preview.test.ts tests/product-identity.test.ts`

Expected: PASS.

```bash
git add src/lib/products src/lib/scraping/product-page-types.ts tests/product-preview.test.ts tests/product-identity.test.ts
git commit -m "feat: preview and validate retailer products"
```

## Task 7: Implement Owner-Scoped Product Mutations

**Files:**
- Create: `src/lib/products/mutations.ts`
- Create: `src/app/api/products/preview/route.ts`
- Create: `src/app/api/products/route.ts`
- Create: `src/app/api/products/[id]/route.ts`
- Create: `src/app/api/products/[id]/listings/route.ts`
- Test: `tests/product-mutations.test.ts`
- Test: `tests/product-routes.test.ts`

- [ ] **Step 1: Write transaction and authorization tests**

Test transactional 20-product enforcement, shared listing reuse, one retailer
per tracked product, cross-user edit/delete rejection, join-only deletion, and
identity mismatch rejection.

- [ ] **Step 2: Run focused tests**

Run: `npx vitest run tests/product-mutations.test.ts tests/product-routes.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement `createTrackedProduct()`**

Inside one serializable transaction:

1. Count active products for `ownerId`.
2. Reject count `>= 20`.
3. Create private product using confirmed preview fields.
4. Upsert retailer listing by `(retailerId, canonicalUrl)`.
5. Create `TrackedProductListing`.
6. Store the first positive snapshot.
7. Record completed onboarding attempt.

- [ ] **Step 4: Implement attach, edit, detach, and delete**

Every lookup uses `{ id, ownerId }`. Attaching calls strict identity comparison.
Detaching deletes only the join. Deleting removes the private product and
joins, leaving shared listing snapshots intact.

- [ ] **Step 5: Implement authenticated routes**

Call `requireAppSession()` inside every handler. Parse all payloads with Zod.
Return `401`, `403`, `409`, or `422` for stable typed errors.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx vitest run tests/product-mutations.test.ts tests/product-routes.test.ts
npm run typecheck
```

Expected: PASS.

```bash
git add src/lib/products/mutations.ts src/app/api/products tests/product-mutations.test.ts tests/product-routes.test.ts
git commit -m "feat: add private tracked product mutations"
```

## Task 8: Migrate The Existing Five Products To The Owner

**Files:**
- Create: `scripts/migrate-legacy-products.ts`
- Create after verified backfill: `prisma/migrations/20260611150000_remove_canonical_products/migration.sql`
- Modify: `package.json`
- Test: `tests/migrate-legacy-products.test.ts`

- [ ] **Step 1: Write migration behavior tests**

Test missing owner profile failure, idempotent rerun, five owner products,
existing 13 listing joins, and no product assignment to other profiles.

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/migrate-legacy-products.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement idempotent legacy backfill**

The script loads `LEGACY_OWNER_EMAIL`, requires exactly one `UserProfile`,
creates/upserts five `TrackedProduct` rows from current canonical rows, and
creates joins for current listings using the old canonical relation.

Add:

```json
"db:migrate-legacy-products": "tsx scripts/migrate-legacy-products.ts"
```

- [ ] **Step 4: Verify locally against a disposable database**

Run:

```bash
npx prisma migrate reset --force
npm run db:seed
npm run db:migrate-legacy-products
npm run db:migrate-legacy-products
```

Expected: second run succeeds without duplicates; five tracked products exist.

- [ ] **Step 5: Deploy the additive migration and backfill production**

Back up Supabase, deploy only
`20260611143000_add_multi_user_products`, sign in as the owner so
`UserProfile` exists, then run the backfill with `LEGACY_OWNER_EMAIL`.
Verify five tracked products and all expected listing joins before continuing.

- [ ] **Step 6: Create and deploy the cleanup migration**

Create `20260611150000_remove_canonical_products/migration.sql` to drop
`RetailerListing.canonicalProductId`, its foreign key/index, and
`CanonicalProduct`. Update `prisma/schema.prisma` in the same commit. Run
`npx prisma migrate deploy` only after the verified production backfill.
Update `tests/schema-contract.test.ts` so it now asserts
`canonicalProduct CanonicalProduct?` is absent.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-legacy-products.ts prisma/schema.prisma prisma/migrations package.json tests/migrate-legacy-products.test.ts
git commit -m "feat: migrate legacy products to owner"
```

## Task 9: Refactor Cached Reads To User Products

**Files:**
- Create: `src/lib/products/queries.ts`
- Modify: `src/lib/pricing/cached-prices.ts`
- Modify: `src/lib/data/seed-data.ts`
- Test: `tests/product-queries.test.ts`
- Modify: `tests/cached-prices.test.ts`

- [ ] **Step 1: Write owner-scoped read tests**

Test that two users sharing one listing receive the shared price under their
own product names and cannot see each other's other products.

- [ ] **Step 2: Run focused tests**

Run: `npx vitest run tests/product-queries.test.ts tests/cached-prices.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement owner-rooted queries**

Query `TrackedProduct.findMany({ where: { ownerId, isActive: true } })` with
joins, retailers, latest snapshots, and latest attempts. Map results into new
`TrackedProductSummary`, `TrackedProductPrice`, and history types.

- [ ] **Step 4: Remove runtime seed fallbacks**

Keep only reusable type definitions in `seed-data.ts`, or move those types to
`src/lib/pricing/types.ts`. Delete runtime imports of hardcoded `products` and
`verifiedProductUrls`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx vitest run tests/product-queries.test.ts tests/cached-prices.test.ts
npm run typecheck
```

Expected: PASS.

```bash
git add src/lib/products/queries.ts src/lib/pricing src/lib/data tests
git commit -m "refactor: read prices through user products"
```

## Task 10: Refactor Refresh Around Shared Listings

**Files:**
- Modify: `src/lib/pricing/live-prices.ts`
- Modify: `src/lib/pricing/refresh-prices.ts`
- Create: `src/lib/pricing/scheduled-refresh.ts`
- Modify: `src/app/api/prices/refresh/route.ts`
- Modify: `src/lib/scraping/run-scrape.ts`
- Test: `tests/shared-listing-refresh.test.ts`
- Modify: `tests/refresh-prices.test.ts`

- [ ] **Step 1: Write refresh tests**

Cover one scrape for a URL shared by two users, owner-scoped manual selection,
per-listing lock contention, failed attempts preserving prior snapshots, and
scheduled continuation after one failure.

- [ ] **Step 2: Run focused tests**

Run: `npx vitest run tests/shared-listing-refresh.test.ts tests/refresh-prices.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement `refreshRetailerListing()`**

Load listing plus retailer, acquire
`pg_try_advisory_xact_lock(hashtextextended(listing.id, 0))`, create a started
attempt, parse the URL with the retailer adapter, update raw metadata, create a
positive snapshot, and complete the attempt. Map blocked responses to
`BLOCKED`; sanitize other failures.

- [ ] **Step 4: Implement owner-scoped manual refresh**

Resolve distinct listing IDs from the current user's joins. Support either all
active products or one owner-scoped tracked product ID. Do not accept product
slug as authorization.

- [ ] **Step 5: Implement scheduled refresh**

Load distinct listings joined to active products and process sequentially or
with a retailer-safe concurrency of one. Return totals for completed, blocked,
failed, and already locked.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx vitest run tests/shared-listing-refresh.test.ts tests/refresh-prices.test.ts
npm run typecheck
```

Expected: PASS.

```bash
git add src/lib/pricing src/app/api/prices/refresh/route.ts src/lib/scraping/run-scrape.ts tests
git commit -m "feat: refresh shared retailer listings"
```

## Task 11: Build The Authenticated Product UI And Theme

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/products/page.tsx`
- Modify: `src/app/products/[slug]/page.tsx`
- Create: `src/app/products/new/page.tsx`
- Create: `src/app/products/new/product-wizard.tsx`
- Create: `src/app/products/[slug]/edit/page.tsx`
- Create: `src/app/account/page.tsx`
- Modify: `src/app/refresh-button.tsx`
- Test: `tests/product-wizard.test.tsx`
- Test: `tests/authenticated-pages.test.tsx`

- [ ] **Step 1: Write component tests**

Test URL preview, editable confirmation, specific parse error, 20-product
limit, mismatch display, delete confirmation, stale price status, and signed-in
navigation.

- [ ] **Step 2: Run component tests**

Run: `npx vitest run tests/product-wizard.test.tsx tests/authenticated-pages.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Apply Nunito and palette tokens**

Use `next/font/google` with Nunito. Define CSS variables:

```css
:root {
  --peach: #ff9890;
  --ivory: #fff9f3;
  --sage: #bfd8b8;
  --lilac: #c9b7f6;
  --charcoal: #444444;
}
```

Use charcoal text, ivory background, peach primary actions, sage status/table
surfaces, and lilac focus rings.

- [ ] **Step 4: Build private pages**

All server pages call `requireAppSession()` and owner-scoped query functions.
Navigation contains Dashboard, Products, Account, and Sign out. Keep Deals and
Review until Phase 2 removes them, but do not expose them to signed-out users.

- [ ] **Step 5: Build the two-step product wizard**

Step 1 previews URL. Step 2 edits and confirms extracted fields. Add later
retailer URLs from product detail/edit. Keep entered URLs after errors.

- [ ] **Step 6: Verify in tests and browser**

Run:

```bash
npx vitest run tests/product-wizard.test.tsx tests/authenticated-pages.test.tsx
npm run typecheck
```

Then start `npm run dev` and use the in-app Browser to verify login, desktop,
and mobile layouts.

- [ ] **Step 7: Commit**

```bash
git add src/app tailwind.config.ts tests/product-wizard.test.tsx tests/authenticated-pages.test.tsx
git commit -m "feat: add private product tracking UI"
```

## Task 12: Configure Twice-Daily GitHub Actions Refresh

**Files:**
- Modify: `.github/workflows/scheduled-scrape.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Test: `tests/scheduled-workflow.test.ts`

- [ ] **Step 1: Write workflow contract test**

Assert the workflow has `workflow_dispatch`, two schedules with
`timezone: "Asia/Singapore"`, Playwright Chromium installation, `DIRECT_URL`,
and the scheduled refresh command.

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/scheduled-workflow.test.ts`

Expected: FAIL.

- [ ] **Step 3: Enable the workflow**

Use:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: "0 0 * * *"
      timezone: "Asia/Singapore"
    - cron: "0 12 * * *"
      timezone: "Asia/Singapore"
```

Add `DIRECT_URL`, install Chromium with
`npx playwright install --with-deps chromium`, and run the new shared-listing
scheduled command.

- [ ] **Step 4: Document required GitHub secrets**

The live repository currently has no Actions secrets. Add these through GitHub
Settings before enabling production execution:

- `DATABASE_URL`
- `DIRECT_URL`
- `SCRAPER_USER_AGENT`

Do not place secret values in the repository.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx vitest run tests/scheduled-workflow.test.ts
npm test
npm run typecheck
npm run lint
npx prisma validate
npm run build
```

Expected: all pass.

```bash
git add .github README.md tests/scheduled-workflow.test.ts
git commit -m "ci: refresh shared prices twice daily"
```

## Task 13: Configure Supabase Auth And Deploy The Migration

**External configuration plus verification; do not store secrets in Git.**

- [ ] **Step 1: Configure Supabase magic-link URLs**

In project `axmooodckwmazabgitkv`, enable Email Magic Link and add:

- `http://localhost:3000/auth/callback`
- `https://singapore-grocery-price-tracker.vercel.app/auth/callback`

Set the production Site URL to the Vercel app URL.

- [ ] **Step 2: Configure production email delivery**

Configure custom SMTP before public sharing. Send a test magic link and verify
that it reaches a non-owner address.

- [ ] **Step 3: Add Vercel environment values**

Add the public Supabase URL, publishable key, `LEGACY_OWNER_EMAIL`, database
URLs, and scraper user agent to Production and Preview as appropriate.

- [ ] **Step 4: Confirm both schema deployments completed safely**

Confirm Task 8 deployed the additive migration, ran the owner backfill, and
only then deployed the canonical-product cleanup migration. Verify five owner
products and all expected joins before removing any remaining runtime fallback.

- [ ] **Step 5: Add GitHub Actions secrets and dispatch once**

Add the three secret names from Task 12, run `Scheduled Scrape` manually, and
confirm attempts and snapshots in Supabase before relying on schedules.

- [ ] **Step 6: Final production verification**

Verify:

- Signed-out routes redirect to login.
- 24-hour and 30-day logins create different `AppSession.expiresAt`.
- Existing five products appear only for the owner.
- A second user starts empty.
- A shared URL is scraped once.
- Manual refresh cannot target another user's product.

- [ ] **Step 7: Commit any deployment documentation adjustments**

```bash
git add README.md docs
git commit -m "docs: document authenticated deployment"
```
