# Dated Weekly Promotion Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale weekly promotion deals by dated promotion series, discover both FairPrice feeds and the current Cold Storage feed, and reject unreliable OCR candidates.

**Architecture:** Retailer adapters return dated page assets carrying a stable `seriesKey`, publication identity, and page number. The refresh service groups pages into publications, makes one replace/skip decision per series and validity period, then stores one flyer row per page so existing flyer links remain accurate. Date parsing and candidate validation are isolated pure functions; production persistence is exercised only through mocked tests and the user-triggered deployed endpoint.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/PostgreSQL, Cheerio, Publitas public JSON, Tesseract.js, Vitest.

---

## File Map

- Create `src/lib/promotions/dates.ts`: Singapore date-range parsing and current-date predicates.
- Modify `src/lib/promotions/types.ts`: stable series keys, publication keys, required dates, and page numbers.
- Modify `src/lib/promotions/sources.ts`: discover both FairPrice Publitas publications, current Cold Storage route, Giant, and optional Sheng Siong.
- Add fixtures under `tests/fixtures/promotions/`: saved FairPrice Publitas metadata and dated Cold Storage page HTML.
- Modify `tests/promotion-sources.test.ts`: discovery and date parsing coverage.
- Create `src/lib/promotions/ocr.ts`: document OCR plus FairPrice card-region OCR.
- Modify `src/lib/promotions/parser.ts`: remove publication-ID hardcoding and apply trustworthy candidate validation.
- Modify `tests/promotion-parser.test.ts`: current FairPrice card extraction and gibberish rejection.
- Create `tests/promotion-ocr.test.ts`: card-region isolation and partial OCR failure coverage.
- Modify `prisma/schema.prisma`: add `seriesKey` and series/date indexes.
- Create `prisma/migrations/20260607_add_promotion_series_key/migration.sql`: backfill existing flyers and add the required column/indexes.
- Modify `src/lib/promotions/refresh-promotions.ts`: publication grouping, unchanged skip, expiry cleanup, series replacement, and clear-on-parse-failure.
- Modify `tests/refresh-promotions.test.ts`: lifecycle tests for all deal statuses and independent FairPrice series.
- Modify `src/lib/promotions/queries.ts`: date-validity defense in depth for public/review/count/filter queries.
- Modify `tests/promotion-queries.test.ts`: assert date filters.
- Modify `src/app/deals/refresh-weekly-deals-button.tsx`: report skipped publications and removed stale deals.
- Modify `src/app/api/promotions/refresh/route.ts`: return the expanded typed result without changing endpoint behavior.

## Task 1: Promotion Series and Singapore Date Parsing

**Files:**
- Create: `src/lib/promotions/dates.ts`
- Modify: `src/lib/promotions/types.ts`
- Test: `tests/promotion-dates.test.ts`

- [ ] **Step 1: Write failing date parsing tests**

Create `tests/promotion-dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isPromotionExpired,
  parsePromotionDateRange
} from "@/lib/promotions/dates";

describe("promotion dates", () => {
  it("parses a full FairPrice range in Singapore time", () => {
    expect(parsePromotionDateRange("4 - 10 Jun 2026")).toEqual({
      validFrom: new Date("2026-06-03T16:00:00.000Z"),
      validTo: new Date("2026-06-10T15:59:59.999Z")
    });
  });

  it("parses a Cold Storage title with an inferred start date", () => {
    expect(
      parsePromotionDateRange("Grocery Selections (Till 10 June)", {
        referenceDate: new Date("2026-06-07T04:00:00.000Z"),
        defaultDurationDays: 7
      })
    ).toEqual({
      validFrom: new Date("2026-06-03T16:00:00.000Z"),
      validTo: new Date("2026-06-10T15:59:59.999Z")
    });
  });

  it("expires a promotion only after its Singapore end date", () => {
    const validTo = new Date("2026-06-10T15:59:59.999Z");
    expect(isPromotionExpired(validTo, new Date("2026-06-10T15:00:00.000Z"))).toBe(false);
    expect(isPromotionExpired(validTo, new Date("2026-06-10T16:00:00.000Z"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- tests/promotion-dates.test.ts
```

Expected: FAIL because `@/lib/promotions/dates` does not exist.

- [ ] **Step 3: Add stable series and page identity types**

Update `src/lib/promotions/types.ts`:

```ts
export type PromotionSeriesKey =
  | "fairprice-weekly-savers"
  | "fairprice-must-buy"
  | "cold-storage-grocery-selections"
  | "giant-super-savings"
  | "sheng-siong-newspaper-advertisement";

export type PromotionParserKind = "fairprice-grid" | "document";

export type PromotionSource = {
  seriesKey: PromotionSeriesKey;
  publicationKey: string;
  retailerSlug: PromotionRetailerSlug;
  title: string;
  sourceUrl: string;
  assetUrl: string;
  assetKind: PromotionAssetKind;
  parserKind: PromotionParserKind;
  pageNumber: number;
  validFrom: Date;
  validTo: Date;
};

export type PromotionDiscoveryFailure = {
  seriesKey: PromotionSeriesKey;
  message: string;
};

export type PromotionDiscoveryResult = {
  sources: PromotionSource[];
  failures: PromotionDiscoveryFailure[];
};

export type PromotionTextItem = {
  str: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  regionId?: string;
};
```

- [ ] **Step 4: Implement Singapore date parsing**

Create `src/lib/promotions/dates.ts`:

```ts
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

type DateRangeOptions = {
  referenceDate?: Date;
  defaultDurationDays?: number;
};

export function parsePromotionDateRange(
  text: string,
  options: DateRangeOptions = {}
) {
  const full = text.match(
    /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i
  );
  if (full) {
    const [, startDay, endDay, month, year] = full;
    return singaporeRange(
      Number(year),
      monthIndex(month),
      Number(startDay),
      Number(endDay)
    );
  }

  const till = text.match(/till\s+(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/i);
  if (!till) {
    throw new Error(`Promotion validity range was not found: ${text}`);
  }

  const reference = options.referenceDate ?? new Date();
  const singaporeYear = Number(
    new Intl.DateTimeFormat("en-SG", {
      timeZone: "Asia/Singapore",
      year: "numeric"
    }).format(reference)
  );
  const endDay = Number(till[1]);
  const year = Number(till[3] ?? singaporeYear);
  const duration = options.defaultDurationDays ?? 7;
  return singaporeRange(year, monthIndex(till[2]), endDay - duration + 1, endDay);
}

export function isPromotionExpired(validTo: Date, now = new Date()) {
  return now.getTime() > validTo.getTime();
}

function singaporeRange(year: number, month: number, startDay: number, endDay: number) {
  return {
    validFrom: new Date(Date.UTC(year, month, startDay - 1, 16, 0, 0, 0)),
    validTo: new Date(Date.UTC(year, month, endDay, 15, 59, 59, 999))
  };
}

function monthIndex(value: string) {
  const month = MONTHS[value.slice(0, 3).toLowerCase()];
  if (month === undefined) {
    throw new Error(`Unsupported promotion month: ${value}`);
  }
  return month;
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- tests/promotion-dates.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/promotions/dates.ts src/lib/promotions/types.ts tests/promotion-dates.test.ts
git commit -m "Add dated promotion series types"
```

## Task 2: Discover Both FairPrice Feeds and Current Cold Storage

**Files:**
- Modify: `src/lib/promotions/sources.ts`
- Modify: `tests/promotion-sources.test.ts`
- Create: `tests/fixtures/promotions/fairprice-weekly-savers-data.json`
- Create: `tests/fixtures/promotions/fairprice-weekly-savers-spreads.json`
- Create: `tests/fixtures/promotions/fairprice-must-buy-data.json`
- Create: `tests/fixtures/promotions/fairprice-must-buy-spreads.json`
- Create: `tests/fixtures/promotions/cold-storage-listing.html`
- Create: `tests/fixtures/promotions/cold-storage-grocery-selections.html`

- [ ] **Step 1: Save bounded public fixtures**

Save only the fields the adapters consume:

```json
{
  "id": 1773987,
  "config": {
    "publicationOriginalTitle": "Price Drop Buy Now - Must Buy {4 Jun - 10 Jun 2026}"
  }
}
```

The spreads fixture shape is:

```json
[
  {
    "pages": [
      {
        "number": 1,
        "images": {
          "at1600": "/91990/1773987/pages/de194bc4-ad2e-4277-a084-57c43666d936-at1600.jpg"
        }
      }
    ]
  }
]
```

The Cold Storage listing fixture must link to `/weekly-ads/Grocery-Selections-1`.
The detail fixture must include:

```html
<h1>Grocery Selections (Till 10 June)</h1>
<a href="https://csp.coldstorage.com.sg/media/weeklydeals/current.pdf">Shop Now</a>
```

- [ ] **Step 2: Replace the source test with dated publication expectations**

Update `tests/promotion-sources.test.ts` so it asserts:

```ts
expect(sources).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      seriesKey: "fairprice-weekly-savers",
      publicationKey: "fairprice-weekly-savers:1773986",
      pageNumber: 1,
      validFrom: new Date("2026-06-03T16:00:00.000Z"),
      validTo: new Date("2026-06-10T15:59:59.999Z")
    }),
    expect.objectContaining({
      seriesKey: "fairprice-must-buy",
      publicationKey: "fairprice-must-buy:1773987",
      pageNumber: 1
    }),
    expect.objectContaining({
      seriesKey: "cold-storage-grocery-selections",
      sourceUrl: "https://coldstorage.com.sg/weekly-ads/Grocery-Selections-1",
      validFrom: new Date("2026-06-03T16:00:00.000Z"),
      validTo: new Date("2026-06-10T15:59:59.999Z")
    })
  ])
);
```

Also assert two pages are returned for each FairPrice series.
Assert `result.failures` identifies the exact series when one Publitas metadata
request fails, while the other FairPrice series remains in `result.sources`.

- [ ] **Step 3: Run the source test and verify RED**

Run:

```bash
npm test -- tests/promotion-sources.test.ts
```

Expected: FAIL because only Weekly Savers HTML scraping exists and dates/series keys are absent.

- [ ] **Step 4: Implement Publitas JSON discovery**

In `src/lib/promotions/sources.ts`, define both feeds:

```ts
const FAIRPRICE_SERIES = [
  {
    seriesKey: "fairprice-weekly-savers",
    url: "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers"
  },
  {
    seriesKey: "fairprice-must-buy",
    url: "https://promotions.fairprice.com.sg/price-drop-buy-now-must-buy"
  }
] as const;
```

Add:

```ts
async function discoverFairPrice(fetcher: PromotionFetch): Promise<PromotionSource[]> {
  const publications = await Promise.all(
    FAIRPRICE_SERIES.map(async ({ seriesKey, url }) => {
      const [metadata, spreads] = await Promise.all([
        fetchJson<PublitasMetadata>(fetcher, `${url}/data.json`),
        fetchJson<PublitasSpread[]>(fetcher, `${url}/spreads.json`)
      ]);
      const dates = parsePromotionDateRange(metadata.config.publicationOriginalTitle);
      return spreads.flatMap((spread) =>
        spread.pages.map((page) => ({
          seriesKey,
          publicationKey: `${seriesKey}:${metadata.id}`,
          retailerSlug: "fairprice" as const,
          title: metadata.config.publicationOriginalTitle,
          sourceUrl: `${url}/page/${page.number}`,
          assetUrl: new URL(page.images.at1600, "https://view.publitas.com").toString(),
          assetKind: "image" as const,
          parserKind: "fairprice-grid" as const,
          pageNumber: page.number,
          ...dates
        }))
      );
    })
  );
  return publications.flat();
}
```

Add a typed `fetchJson` using the same clear user agent as `fetchText`.

- [ ] **Step 5: Implement dynamic Cold Storage discovery**

Use the `/weekly-ads` listing to find the first Grocery Selections detail URL,
then parse its heading and PDF/image URL:

```ts
async function discoverColdStorage(fetcher: PromotionFetch): Promise<PromotionSource[]> {
  const listing = await fetchText(fetcher, "https://coldstorage.com.sg/weekly-ads");
  const detailUrl = findLink(
    listing,
    "https://coldstorage.com.sg/weekly-ads",
    /grocery selections/i
  );
  if (!detailUrl) return [];

  const html = await fetchText(fetcher, detailUrl);
  const title = getHeading(html) ?? "";
  const dates = parsePromotionDateRange(title, { defaultDurationDays: 7 });
  const assetUrl = findPdfUrl(html, detailUrl) ?? findPrimaryImageUrl(html, detailUrl);
  if (!assetUrl) return [];

  return [{
    seriesKey: "cold-storage-grocery-selections",
    publicationKey: `cold-storage-grocery-selections:${dates.validFrom.toISOString()}`,
    retailerSlug: "cold-storage",
    title,
    sourceUrl: detailUrl,
    assetUrl,
    assetKind: /\.pdf(?:$|\?)/i.test(assetUrl) ? "pdf" : "image",
    parserKind: "document",
    pageNumber: 1,
    ...dates
  }];
}
```

Apply equivalent stable series keys and parsed dates to Giant and Sheng Siong.
If dates cannot be verified, return no source for that retailer rather than
creating an undated publication.

Make the exported discovery function return `PromotionDiscoveryResult`. Run
each configured series independently and preserve failures:

```ts
export async function discoverPromotionSources(
  fetcher: PromotionFetch = fetch
): Promise<PromotionDiscoveryResult> {
  const attempts = await Promise.all(
    DISCOVERY_TASKS.map(async ({ seriesKey, discover }) => {
      try {
        return { sources: await discover(fetcher), failures: [] };
      } catch (error) {
        return {
          sources: [],
          failures: [{
            seriesKey,
            message: error instanceof Error ? error.message : String(error)
          }]
        };
      }
    })
  );

  return {
    sources: attempts.flatMap((attempt) => attempt.sources),
    failures: attempts.flatMap((attempt) => attempt.failures)
  };
}
```

Do not use one retailer-level `Promise.all` for both FairPrice feeds. Weekly
Savers and Must Buy must succeed or fail independently.

- [ ] **Step 6: Run source tests and verify GREEN**

Run:

```bash
npm test -- tests/promotion-sources.test.ts tests/promotion-dates.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/promotions/sources.ts tests/promotion-sources.test.ts tests/fixtures/promotions
git commit -m "Discover dated promotion publications"
```

## Task 3: Reject Gibberish and Remove Flyer-ID Hardcoding

**Files:**
- Modify: `src/lib/promotions/parser.ts`
- Create: `src/lib/promotions/ocr.ts`
- Modify: `tests/promotion-parser.test.ts`
- Create: `tests/promotion-ocr.test.ts`
- Create: `tests/fixtures/promotions/fairprice-must-buy-page-1.tsv`
- Create: `tests/fixtures/promotions/fairprice-weekly-savers-page-1.tsv`

- [ ] **Step 1: Add failing parser tests from current flyers**

Add tests that pass saved positioned OCR words to
`extractPromotionDealsFromPages`. Required assertions:

```ts
expect(deals).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      category: "ICE_CREAM",
      rawTitle: expect.stringContaining("MAGNUM"),
      priceText: "$22.50",
      promoText: expect.stringContaining("3 FOR")
    }),
    expect.objectContaining({
      category: "SNACKS",
      rawTitle: expect.stringContaining("LAYS"),
      priceText: "$3.00",
      promoText: expect.stringContaining("2 FOR")
    })
  ])
);
```

Add a regression test for the observed gibberish:

```ts
it("rejects fragmented FairPrice OCR without a trustworthy card price", () => {
  const deals = extractPromotionDealsFromPages([{
    pageNumber: 1,
    text: "",
    items: [
      { str: "—ema", x: 10, y: 10 },
      { str: "Pocky", x: 20, y: 20 },
      { str: "Chocolate/strawberry/", x: 30, y: 30 },
      { str: "140g", x: 40, y: 40 },
      { str: "2FOR", x: 500, y: 600 }
    ]
  }]);
  expect(deals).toEqual([]);
});
```

- [ ] **Step 2: Run parser tests and verify RED**

Run:

```bash
npm test -- tests/promotion-parser.test.ts
```

Expected: FAIL because the current image-grid parser accepts detached promo text
and current flyer IDs have no generic verified path.

- [ ] **Step 3: Add FairPrice card-level OCR**

In `src/lib/promotions/ocr.ts`, branch on `parserKind`. For
`"fairprice-grid"`, load the image with `@napi-rs/canvas`, remove the publication
header, split the remaining page into the regular product-card columns and row
bands, and OCR each crop separately. Translate crop coordinates back to page
coordinates and preserve a `regionId` on every positioned word.

Add tests proving words from adjacent cards receive different `regionId`
values and that a crop OCR failure only drops that crop, not the whole flyer
page. Move the current PDF/image OCR implementation out of `parser.ts` into this
module and use `"document"` for the existing behavior. Do not key either path by
publication ID or asset URL.

- [ ] **Step 4: Add a single candidate quality gate**

In `src/lib/promotions/parser.ts`, add and apply:

```ts
export function isTrustworthyPromotionDeal(deal: ExtractedPromotionDeal) {
  const readableWords = deal.rawTitle.match(/[A-Za-z][A-Za-z'&.-]{1,}/g) ?? [];
  const completePromo = deal.promoText
    ? /(?:\d+\s+FOR|ANY\s+\d+|BUY\s+\d+\s+GET\s+\d+\s+FREE|SAVE\s+(?:\$?\d|UP TO))/i
        .test(deal.promoText)
    : false;

  return (
    readableWords.length >= 2 &&
    deal.rawTitle.length >= 8 &&
    deal.rawTitle.length <= 140 &&
    (deal.parsedPrice !== null && deal.parsedPrice > 0 || completePromo) &&
    deal.confidence >= 0.7
  );
}
```

Return `deals.filter(isTrustworthyPromotionDeal)` from the generic extraction
path. For FairPrice grid input, require title, price, and promotion words to
share the same `regionId`; never join detached words from adjacent cards.

- [ ] **Step 5: Remove publication-specific verified deal lists**

Delete `getVerifiedCurrentFlyerDeals`, `verifiedDeal`, and all asset URL checks.
Keep the explicit Sheng Siong reliability guard until its generic fixture
passes the same quality gate.

- [ ] **Step 6: Run parser tests and verify GREEN**

Run:

```bash
npm test -- tests/promotion-parser.test.ts tests/promotion-ocr.test.ts
```

Expected: current FairPrice Magnum/snack cases PASS, gibberish case returns no
deals, and existing positioned PDF parser tests remain green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/promotions/parser.ts src/lib/promotions/ocr.ts tests/promotion-parser.test.ts tests/promotion-ocr.test.ts tests/fixtures/promotions/*.tsv
git commit -m "Validate generic flyer OCR candidates"
```

## Task 4: Add Promotion Series Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260607_add_promotion_series_key/migration.sql`

- [ ] **Step 1: Add `seriesKey` to the Prisma model**

Update `PromotionFlyer`:

```prisma
model PromotionFlyer {
  id           String               @id @default(cuid())
  seriesKey    String
  retailerId   String
  // existing fields unchanged

  @@index([retailerId])
  @@index([seriesKey, validFrom])
  @@index([seriesKey, validTo])
  @@index([validFrom, validTo])
}
```

- [ ] **Step 2: Write the migration with deterministic backfill**

Create `prisma/migrations/20260607_add_promotion_series_key/migration.sql`:

```sql
ALTER TABLE "PromotionFlyer" ADD COLUMN "seriesKey" TEXT;

UPDATE "PromotionFlyer"
SET "seriesKey" = CASE
  WHEN "sourceUrl" ILIKE '%weekly-savers%' THEN 'fairprice-weekly-savers'
  WHEN "sourceUrl" ILIKE '%must-buy%' THEN 'fairprice-must-buy'
  WHEN "sourceUrl" ILIKE '%coldstorage.com.sg/weekly-ads%' THEN 'cold-storage-grocery-selections'
  WHEN "sourceUrl" ILIKE '%giant.sg/super-savings%' THEN 'giant-super-savings'
  WHEN "sourceUrl" ILIKE '%shengsiong.com.sg%' THEN 'sheng-siong-newspaper-advertisement'
  ELSE 'legacy-' || "retailerId"
END;

ALTER TABLE "PromotionFlyer" ALTER COLUMN "seriesKey" SET NOT NULL;

CREATE INDEX "PromotionFlyer_seriesKey_validFrom_idx"
ON "PromotionFlyer"("seriesKey", "validFrom");

CREATE INDEX "PromotionFlyer_seriesKey_validTo_idx"
ON "PromotionFlyer"("seriesKey", "validTo");
```

- [ ] **Step 3: Generate and validate Prisma**

Run:

```bash
npx prisma generate
npx prisma validate
```

Expected: client generation succeeds and schema is valid.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260607_add_promotion_series_key/migration.sql
git commit -m "Track promotion flyer series"
```

## Task 5: Implement Dated Replacement and Clear-on-Failure

**Files:**
- Modify: `src/lib/promotions/refresh-promotions.ts`
- Rewrite: `tests/refresh-promotions.test.ts`

- [ ] **Step 1: Write failing unchanged-publication test**

Test that a stored flyer with the same `seriesKey` and `validFrom` causes:

```ts
expect(fetchAsset).not.toHaveBeenCalled();
expect(parseAsset).not.toHaveBeenCalled();
expect(result.publicationsSkipped).toBe(1);
```

- [ ] **Step 2: Write failing newer-publication replacement test**

Mock old pending, approved, and rejected deals under
`fairprice-must-buy`. Assert one call removes all deals by old flyer IDs before
new assets are fetched:

```ts
expect(deleteMany).toHaveBeenCalledWith({
  where: { flyerId: { in: ["old-must-buy-page-1", "old-must-buy-page-2"] } }
});
expect(deleteMany.mock.invocationCallOrder[0])
  .toBeLessThan(fetchAsset.mock.invocationCallOrder[0]);
```

Also assert no deletion targets `fairprice-weekly-savers`.

- [ ] **Step 3: Write failing clear-on-parse-failure test**

Make `parseAsset` throw after discovery returns a newer dated publication.
Assert stale deals were deleted, a `PARSE_FAILED` flyer was stored, and old
deals were not recreated.

- [ ] **Step 4: Write failing expiry-without-replacement test**

Inject `now = new Date("2026-06-11T00:00:00+08:00")`, return no discovered
source, and assert deals for a flyer ending June 10 are deleted.

- [ ] **Step 5: Write failing valid-source-failure retention test**

Return a discovery failure for a still-valid series and assert its deal deletion
is not called.

- [ ] **Step 6: Run refresh tests and verify RED**

Run:

```bash
npm test -- tests/refresh-promotions.test.ts
```

Expected: FAIL because refresh currently fetches every asset, deduplicates by
asset hash only, and never clears stale series.

- [ ] **Step 7: Expand refresh result and dependency interfaces**

Use:

```ts
export type PromotionRefreshResult = {
  publicationsDiscovered: number;
  publicationsSkipped: number;
  staleDealsRemoved: number;
  flyersFetched: number;
  candidatesCreated: number;
  parseFailures: number;
  failures: Array<{ seriesKey: PromotionSeriesKey; message: string }>;
};
```

Add `now?: Date` to dependencies. Extend the mocked client contract with:

```ts
promotionFlyer: {
  findMany(args: unknown): Promise<StoredFlyer[]>;
  findUnique(args: unknown): Promise<StoredFlyer | null>;
  create(args: unknown): Promise<{ id: string }>;
};
promotionDeal: {
  deleteMany(args: unknown): Promise<{ count: number }>;
  createMany(args: unknown): Promise<{ count: number }>;
};
```

Change the discovery dependency to return `PromotionDiscoveryResult`, not a
flat source array. Copy discovery failures into the refresh result so lifecycle
logic can retain still-valid series on adapter failure.

Add `parserKind: PromotionSource["parserKind"]` to the `parseAsset` dependency
input and pass `source.parserKind` on every parser call.

- [ ] **Step 8: Group sources into publications**

Add:

```ts
function groupPublications(sources: PromotionSource[]) {
  const groups = new Map<string, PromotionSource[]>();
  for (const source of sources) {
    const pages = groups.get(source.publicationKey) ?? [];
    pages.push(source);
    groups.set(source.publicationKey, pages);
  }
  return [...groups.values()].map((pages) =>
    pages.sort((a, b) => a.pageNumber - b.pageNumber)
  );
}
```

- [ ] **Step 9: Implement series lifecycle ordering**

For each discovered publication:

```ts
const latest = latestStoredBySeries.get(first.seriesKey);
if (latest && latest.validFrom?.getTime() === first.validFrom.getTime()) {
  result.publicationsSkipped += 1;
  continue;
}

if (!latest || first.validFrom > latest.validFrom!) {
  const staleFlyerIds = storedBySeries
    .get(first.seriesKey)
    ?.map((flyer) => flyer.id) ?? [];
  const removed = await client.promotionDeal.deleteMany({
    where: { flyerId: { in: staleFlyerIds } }
  });
  result.staleDealsRemoved += removed.count;
}

for (const page of publication) {
  await importPromotionPage(page);
}
```

Before importing discovered publications, clear stored series whose `validTo`
is older than injected `now` and which have no same/newer discovered
publication. Clear by the stored flyer IDs for that series. If discovery failed
for an expired series, still clear it. If discovery failed for a series whose
stored validity still includes `now`, retain it and report the failure.

Do not wrap stale deletion and parsing in one rollback transaction: the
approved behavior requires stale deals to remain cleared if replacement parsing
fails.

- [ ] **Step 10: Store series and true page number**

Every created flyer includes `seriesKey`, `validFrom`, and `validTo`. Before
creating deal rows, replace parser-local page numbers with the source page:

```ts
const deals = (await parseAsset(input)).map((deal) => ({
  ...deal,
  pageNumber: source.pageNumber
}));
```

The `input` above includes `parserKind: source.parserKind`, so FairPrice uses
card-region OCR and other retailers retain document OCR.

- [ ] **Step 11: Run refresh tests and verify GREEN**

Run:

```bash
npm test -- tests/refresh-promotions.test.ts
```

Expected: unchanged, independent-series replacement, expiry, clear-on-failure,
and valid-source-failure tests PASS.

- [ ] **Step 12: Commit**

```bash
git add src/lib/promotions/refresh-promotions.ts tests/refresh-promotions.test.ts
git commit -m "Replace stale promotion series by date"
```

## Task 6: Filter Expired Deals From Every Query

**Files:**
- Modify: `src/lib/promotions/queries.ts`
- Modify: `tests/promotion-queries.test.ts`

- [ ] **Step 1: Write failing query tests**

Inject:

```ts
const now = new Date("2026-06-07T05:00:00.000Z");
```

Assert public, pending, counts, and retailer queries include:

```ts
flyer: {
  validFrom: { lte: now },
  validTo: { gte: now }
}
```

- [ ] **Step 2: Run query tests and verify RED**

Run:

```bash
npm test -- tests/promotion-queries.test.ts
```

Expected: FAIL because current queries only filter review status/category.

- [ ] **Step 3: Add one shared active-flyer filter**

In `src/lib/promotions/queries.ts`:

```ts
function activeFlyerWhere(now: Date) {
  return {
    flyer: {
      validFrom: { lte: now },
      validTo: { gte: now }
    }
  };
}
```

Add optional `now = new Date()` parameters to query functions and spread this
filter into approved, pending, count, and retailer relation filters.

- [ ] **Step 4: Run query tests and verify GREEN**

Run:

```bash
npm test -- tests/promotion-queries.test.ts
```

Expected: all query tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/promotions/queries.ts tests/promotion-queries.test.ts
git commit -m "Hide promotions outside flyer dates"
```

## Task 7: Update Refresh UI Summary

**Files:**
- Modify: `src/app/deals/refresh-weekly-deals-button.tsx`
- Modify: `src/app/api/promotions/refresh/route.ts`
- Create: `tests/refresh-weekly-deals-button.test.tsx`

- [ ] **Step 1: Write failing summary test**

Render the button, mock the endpoint response:

```json
{
  "publicationsDiscovered": 4,
  "publicationsSkipped": 2,
  "staleDealsRemoved": 24,
  "flyersFetched": 4,
  "candidatesCreated": 6,
  "parseFailures": 0,
  "failures": []
}
```

Assert the summary includes:

```text
24 stale deals removed, 4 flyer pages imported, 6 review candidates, 2 unchanged publications skipped.
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm test -- tests/refresh-weekly-deals-button.test.tsx
```

Expected: FAIL because the component expects the old duplicate count response.

- [ ] **Step 3: Update the typed response and summary**

Replace the old inline result type with:

```ts
type RefreshResult = {
  publicationsDiscovered: number;
  publicationsSkipped: number;
  staleDealsRemoved: number;
  flyersFetched: number;
  candidatesCreated: number;
  parseFailures: number;
};
```

Build the exact tested summary. Keep the existing full-page loading overlay and
redirect to review only when candidates were created.

- [ ] **Step 4: Run the component test and verify GREEN**

Run:

```bash
npm test -- tests/refresh-weekly-deals-button.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/deals/refresh-weekly-deals-button.tsx src/app/api/promotions/refresh/route.ts tests/refresh-weekly-deals-button.test.tsx
git commit -m "Report dated flyer refresh results"
```

## Task 8: Full Verification and Production Deployment

**Files:**
- Review all modified files
- No direct database commands beyond Prisma validation/generation

- [ ] **Step 1: Run focused promotion tests**

```bash
npm test -- \
  tests/promotion-dates.test.ts \
  tests/promotion-sources.test.ts \
  tests/promotion-parser.test.ts \
  tests/refresh-promotions.test.ts \
  tests/promotion-queries.test.ts \
  tests/refresh-weekly-deals-button.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run required repository checks**

```bash
npm test
npm run typecheck
npm run lint
npx prisma validate
npm run build
```

Expected:

- All tests PASS.
- TypeScript exits 0.
- ESLint reports no errors.
- Prisma schema is valid.
- Next.js production build completes.

- [ ] **Step 3: Inspect the production diff**

```bash
git status --short
git diff --check
git diff --stat 6d26de8..HEAD
```

Expected: only planned promotion, migration, fixture, test, and UI files.

- [ ] **Step 4: Push `main`**

```bash
git push origin main
```

Expected: GitHub accepts the new commits and Vercel starts a production build.

- [ ] **Step 5: Verify deployment without mutating data**

```bash
vercel ls singapore-grocery-price-tracker --yes
vercel inspect singapore-grocery-price-tracker.vercel.app
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://singapore-grocery-price-tracker.vercel.app/deals
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://singapore-grocery-price-tracker.vercel.app/admin/promotions
```

Expected: deployment is `Ready`; both GET requests return `200`.

Do not POST to `/api/promotions/refresh`. The user performs the first production
refresh and confirms:

- Expired May deals disappear.
- FairPrice Weekly Savers and Must Buy import independently.
- Cold Storage uses the June 4-10 Grocery Selections flyer.
- Only readable snack and ice cream candidates enter review.
- A failed new import does not restore stale deals.
