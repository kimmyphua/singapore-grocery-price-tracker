# Shared Flyer Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unreliable promotion OCR/review/deals with shared Cold Storage PDF and FairPrice publication viewers plus a downloadable 12-week history.

**Architecture:** Global `FlyerSource` adapters discover current editions and deduplicate assets by stable metadata and SHA-256. Cold Storage PDFs are stored in a private Supabase Storage bucket and served to signed-in users; FairPrice Publitas editions use the official publication URL with embed/open fallback.

**Tech Stack:** Next.js 14, TypeScript, Prisma 5, Supabase Storage, PDF.js, Vitest, GitHub Actions

---

## File Structure

- Modify `prisma/schema.prisma`: replace promotion OCR models with source/edition models.
- Create `src/lib/flyers/types.ts`: source and edition contracts.
- Create `src/lib/flyers/sources.ts`: Cold Storage and FairPrice discovery.
- Create `src/lib/flyers/storage.ts`: private Supabase Storage operations.
- Create `src/lib/flyers/refresh.ts`: dedupe, persistence, and retention.
- Create `src/lib/flyers/queries.ts`: signed-in current/history reads.
- Create `src/app/flyers/page.tsx`: current viewers and history.
- Create `src/app/flyers/[id]/page.tsx`: edition viewer.
- Create `src/app/api/flyers/[id]/download/route.ts`: authenticated PDF download.
- Remove `src/app/deals`, `src/app/admin/promotions`, and active promotion refresh code.

## Task 1: Replace Promotion Models With Flyer Sources And Editions

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260611160000_replace_promotions_with_flyers/migration.sql`
- Test: `tests/flyer-schema-contract.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
expect(schema).toContain("model FlyerSource");
expect(schema).toContain("model FlyerEdition");
expect(schema).not.toContain("model PromotionDeal");
expect(schema).not.toContain("model PromotionFlyer");
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/flyer-schema-contract.test.ts`

Expected: FAIL.

- [ ] **Step 3: Define the new models**

```prisma
enum FlyerSourceKind {
  DIRECT_PDF
  PUBLITAS
}

enum FlyerAssetKind {
  PDF
  PUBLICATION
}

model FlyerSource {
  id               String           @id @default(cuid())
  key              String           @unique
  retailerId       String
  title            String
  landingUrl       String
  kind             FlyerSourceKind
  isActive         Boolean          @default(true)
  lastCheckedAt    DateTime?
  lastCheckStatus  String?
  lastErrorMessage String?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  retailer         Retailer         @relation(fields: [retailerId], references: [id])
  editions         FlyerEdition[]
}

model FlyerEdition {
  id             String         @id @default(cuid())
  sourceId       String
  title          String
  sourceUrl      String
  directPdfUrl   String?
  storagePath    String?
  publicationUrl String?
  assetKind      FlyerAssetKind
  contentHash    String
  validFrom      DateTime?
  validTo        DateTime?
  firstSeenAt    DateTime       @default(now())
  lastCheckedAt  DateTime       @default(now())
  source         FlyerSource    @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  @@unique([sourceId, contentHash])
  @@index([sourceId, firstSeenAt])
}
```

- [ ] **Step 4: Write destructive migration SQL**

Drop `PromotionDeal` first, then `PromotionFlyer` and obsolete promotion enums.
Create the new models. This intentionally discards unreliable parsed promotion
data.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx prisma format
npx prisma validate
npx vitest run tests/flyer-schema-contract.test.ts
```

Expected: PASS.

```bash
git add prisma tests/flyer-schema-contract.test.ts
git commit -m "refactor: replace promotion data with flyer editions"
```

## Task 2: Implement Cold Storage And FairPrice Discovery

**Files:**
- Create: `src/lib/flyers/types.ts`
- Create: `src/lib/flyers/sources.ts`
- Test: `tests/flyer-sources.test.ts`
- Reuse: `tests/fixtures/promotions/cold-storage-weekly.html`
- Reuse: `tests/fixtures/promotions/fairprice-weekly-savers-data.json`
- Reuse: `tests/fixtures/promotions/fairprice-weekly-savers-spreads.json`

- [ ] **Step 1: Write discovery tests**

```ts
expect(discoverColdStorageEdition(html)).toMatchObject({
  kind: "DIRECT_PDF",
  directPdfUrl: expect.stringMatching(/\\.pdf$/),
  title: expect.stringContaining("Grocery Selections")
});
expect(discoverFairPriceEdition(data, spreads)).toMatchObject({
  kind: "PUBLITAS",
  publicationUrl: expect.stringContaining("promotions.fairprice.com.sg")
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/flyer-sources.test.ts`

Expected: FAIL.

- [ ] **Step 3: Define the discovery contract**

```ts
type DiscoveredFlyerEdition = {
  sourceKey: "cold-storage-grocery-selections" | "fairprice-weekly-savers";
  title: string;
  sourceUrl: string;
  directPdfUrl: string | null;
  publicationUrl: string | null;
  assetKind: "PDF" | "PUBLICATION";
  validFrom: Date | null;
  validTo: Date | null;
  metadataFingerprint: string;
};
```

- [ ] **Step 4: Implement both adapters**

Cold Storage extracts the current title and direct PDF. FairPrice uses public
Publitas metadata/spreads to identify the publication, date range, and public
viewer URL. Do not reconstruct a PDF from page images.

- [ ] **Step 5: Verify against fixtures and live public pages**

Run: `npx vitest run tests/flyer-sources.test.ts`

Then manually fetch the two approved landing pages and confirm selectors still
match before claiming support.

- [ ] **Step 6: Commit**

```bash
git add src/lib/flyers tests/flyer-sources.test.ts tests/fixtures
git commit -m "feat: discover current supermarket flyers"
```

## Task 3: Add Private Supabase Flyer Storage

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/flyers/storage.ts`
- Modify: `.env.example`
- Test: `tests/flyer-storage.test.ts`

- [ ] **Step 1: Write storage tests**

Test deterministic storage path, PDF upload, signed download URL, and owned
asset deletion.

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/flyer-storage.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add server-only storage configuration**

Add:

```dotenv
SUPABASE_SECRET_KEY=""
SUPABASE_FLYER_BUCKET="flyers"
```

Create an admin Supabase client that is imported only from server modules.

- [ ] **Step 4: Implement storage operations**

Use paths:

```text
<source-key>/<yyyy-mm-dd>/<sha256>.pdf
```

Upload with `contentType: "application/pdf"` and `upsert: false`. Generate
short-lived signed URLs only after application authentication.

- [ ] **Step 5: Configure the live Supabase bucket**

The inspected project currently has no visible flyer bucket. Create private
bucket `flyers`; do not make it public. Server-side download routes use the
secret key after app-session verification.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/flyer-storage.test.ts`

Expected: PASS.

```bash
git add src/lib/supabase/admin.ts src/lib/flyers/storage.ts .env.example tests/flyer-storage.test.ts
git commit -m "feat: store flyer PDFs privately"
```

## Task 4: Implement Dedupe, Refresh, And 12-Week Retention

**Files:**
- Create: `src/lib/flyers/refresh.ts`
- Create: `src/lib/flyers/seed.ts`
- Modify: `src/lib/pricing/scheduled-refresh.ts`
- Test: `tests/flyer-refresh.test.ts`

- [ ] **Step 1: Write refresh tests**

Cover unchanged metadata skip, same SHA skip, changed PDF creation, Publitas
edition creation without PDF upload, one-source failure continuation, and
12-week row/storage deletion.

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/flyer-refresh.test.ts`

Expected: FAIL.

- [ ] **Step 3: Seed stable sources**

Upsert exactly:

```ts
[
  {
    key: "cold-storage-grocery-selections",
    retailerSlug: "cold-storage",
    landingUrl: "https://coldstorage.com.sg/weekly-ads/Grocery-Selections",
    kind: "DIRECT_PDF"
  },
  {
    key: "fairprice-weekly-savers",
    retailerSlug: "fairprice",
    landingUrl: "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/page/1",
    kind: "PUBLITAS"
  }
]
```

- [ ] **Step 4: Implement refresh**

Compare metadata fingerprint first. For a possible new PDF, download bytes,
compute SHA-256, and check `(sourceId, contentHash)` before upload/create. For
Publitas, hash stable publication metadata and store only the publication URL.
Update source check status in all outcomes.

- [ ] **Step 5: Implement retention**

Delete editions where `firstSeenAt < now - 12 weeks`. Delete `storagePath`
objects first; delete rows only after storage succeeds. Never delete external
URLs.

- [ ] **Step 6: Integrate with the twice-daily scheduled command**

Run price refresh and flyer refresh as separate reported stages so one stage's
source-level failures do not hide the other stage's result.

- [ ] **Step 7: Verify and commit**

Run: `npx vitest run tests/flyer-refresh.test.ts`

Expected: PASS.

```bash
git add src/lib/flyers src/lib/pricing/scheduled-refresh.ts tests/flyer-refresh.test.ts
git commit -m "feat: refresh and retain flyer editions"
```

## Task 5: Build Authenticated Flyer Viewer And History

**Files:**
- Create: `src/lib/flyers/queries.ts`
- Create: `src/app/flyers/page.tsx`
- Create: `src/app/flyers/[id]/page.tsx`
- Create: `src/app/flyers/pdf-viewer.tsx`
- Create: `src/app/api/flyers/[id]/download/route.ts`
- Modify: `src/app/layout.tsx`
- Test: `tests/flyer-pages.test.tsx`
- Test: `tests/flyer-download-route.test.ts`

- [ ] **Step 1: Write page and download tests**

Test current cards, 12-week history rows, PDF download only for signed-in users,
Publitas `Open publication`, and embed fallback copy.

- [ ] **Step 2: Run focused tests**

Run: `npx vitest run tests/flyer-pages.test.tsx tests/flyer-download-route.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement signed-in queries**

Return current edition per source plus editions ordered by `firstSeenAt desc`.
All routes require `requireAppSession()`, even though flyer content is shared.

- [ ] **Step 4: Implement PDF viewer and download**

Use the existing `pdfjs-dist` dependency to render signed PDF bytes. The
download route verifies auth, requires `assetKind === "PDF"` and `storagePath`,
then returns a short-lived signed download redirect.

- [ ] **Step 5: Implement Publitas behavior**

Show the official publication in an iframe only when it loads successfully.
Always provide `Open publication`. If framing fails or is blocked, replace the
viewer area with a concise external-open fallback.

- [ ] **Step 6: Add Flyers navigation**

Add `Flyers` to signed-in navigation between Products and Account.

- [ ] **Step 7: Verify in browser and commit**

Run:

```bash
npx vitest run tests/flyer-pages.test.tsx tests/flyer-download-route.test.ts
npm run typecheck
```

Use the in-app Browser to verify desktop/mobile PDF rendering and the FairPrice
fallback.

```bash
git add src/lib/flyers src/app/flyers src/app/api/flyers src/app/layout.tsx tests
git commit -m "feat: add shared flyer viewer"
```

## Task 6: Remove OCR, Deals, And Promotion Review

**Files:**
- Delete: `src/app/deals/`
- Delete: `src/app/admin/promotions/`
- Delete: `src/app/api/promotions/`
- Delete: `src/lib/promotions/`
- Delete: obsolete promotion tests and OCR fixture-only assets
- Modify: `package.json`
- Modify: `next.config.js`
- Modify: `README.md`
- Test: `tests/removed-promotion-routes.test.ts`

- [ ] **Step 1: Write removal contract test**

Assert navigation contains no Deals/Review links, no active code imports
`PromotionDeal`, and obsolete routes no longer exist.

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/removed-promotion-routes.test.ts`

Expected: FAIL.

- [ ] **Step 3: Delete inactive promotion workflow**

Remove OCR parsing, review actions, deals pages, promotion APIs, and their
tests. Retain only flyer discovery fixtures used by Task 2.

- [ ] **Step 4: Remove obsolete dependencies**

If no remaining code uses them, uninstall:

```bash
npm uninstall @napi-rs/canvas tesseract.js
```

Keep `pdfjs-dist` for the viewer. Remove obsolete PDF OCR tracing from
`next.config.js`.

- [ ] **Step 5: Update documentation**

Describe Flyers as shared source viewers, not parsed deals. State that flyer
content never feeds `PriceSnapshot`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx vitest run tests/removed-promotion-routes.test.ts
npm test
npm run typecheck
npm run lint
npx prisma validate
npm run build
```

Expected: all pass.

```bash
git add -A
git commit -m "refactor: remove promotion OCR workflow"
```

## Task 7: Deploy Flyer Schema And Storage

- [ ] **Step 1: Back up production**

Create a Supabase database backup or export before applying the destructive
promotion-table migration.

- [ ] **Step 2: Apply migration**

Run:

```bash
npx prisma migrate deploy
```

Confirm `PromotionDeal` and `PromotionFlyer` are gone and `FlyerSource` plus
`FlyerEdition` exist.

- [ ] **Step 3: Create the private `flyers` bucket**

Use Supabase Storage, keep it private, and add `SUPABASE_SECRET_KEY` plus
`SUPABASE_FLYER_BUCKET=flyers` to Vercel.

- [ ] **Step 4: Add required GitHub secret**

Add `SUPABASE_SECRET_KEY` to GitHub Actions because the scheduled flyer refresh
uploads PDFs. The live repository currently has no Actions secrets, so also
confirm the Phase 1 database and scraper secrets exist.

- [ ] **Step 5: Dispatch scheduled refresh**

Run the workflow manually and verify:

- One Cold Storage PDF edition and stored object
- One FairPrice publication edition
- A second run reports both unchanged
- Signed-in history shows both
- Cold Storage downloads
- FairPrice opens the official viewer

- [ ] **Step 6: Verify retention with controlled data**

Insert a test edition older than 12 weeks in a non-production test environment,
run cleanup, and confirm both its owned object and row are removed.

- [ ] **Step 7: Record deployment result**

Update README operational notes and commit:

```bash
git add README.md docs
git commit -m "docs: document flyer viewer operations"
```
