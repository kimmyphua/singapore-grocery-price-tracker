import { describe, expect, it, vi } from "vitest";
import { getCachedLatestPrices, getCachedWeeklyPriceHistory } from "@/lib/pricing/cached-prices";

describe("cached latest prices", () => {
  it("maps stored price snapshots into app latest-price rows without scraping", async () => {
    const findMany = vi.fn(async () => [
      {
        price: "12.11",
        originalPrice: "12.95",
        unitPrice: "0.03670",
        promotionText: "Any 2 for $19.80",
        currency: "SGD",
        isAvailable: true,
        capturedAt: new Date("2026-05-28T08:00:00.000Z"),
        retailerListing: {
          productUrl: "https://www.fairprice.com.sg/product/magnum",
          totalSize: 330,
          retailer: { slug: "fairprice", name: "FairPrice" },
          canonicalProduct: {
            slug: "magnum-mini-almond-6x55ml",
            packCount: 6,
            unitSize: 55,
            totalSize: 330,
            unit: "ml"
          }
        }
      }
    ]);

    await expect(
      getCachedLatestPrices({
        priceSnapshot: { findMany }
      })
    ).resolves.toEqual([
      {
        productSlug: "magnum-mini-almond-6x55ml",
        retailerSlug: "fairprice",
        retailerName: "FairPrice",
        price: 12.11,
        originalPrice: 12.95,
        unitPrice: 0.0367,
        effectivePrice: 9.9,
        effectiveUnitPrice: 0.03,
        dealQuantity: 2,
        promotionText: "Any 2 for $19.80",
        capturedAt: "2026-05-28T08:00:00.000Z",
        productUrl: "https://www.fairprice.com.sg/product/magnum",
        isAvailable: true,
        scrapeStatus: "available",
        statusMessage: null,
        source: "cached-price-snapshot"
      }
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("filters cached rows by product slug before rendering a product page", async () => {
    const findMany = vi.fn(async () => []);

    await getCachedLatestPrices(
      { priceSnapshot: { findMany } },
      { productSlug: "kitkat-2-finger-10x15g" }
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          retailerListing: {
            retailer: {
              isActive: true
            },
            canonicalProduct: {
              isActive: true,
              slug: "kitkat-2-finger-10x15g"
            }
          }
        }
      })
    );
  });

  it("only reads snapshots from active retailers", async () => {
    const findMany = vi.fn(async () => []);

    await getCachedLatestPrices({
      priceSnapshot: { findMany }
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          retailerListing: {
            canonicalProduct: {
              isActive: true
            },
            retailer: {
              isActive: true
            }
          }
        }
      })
    );
  });

  it("groups weekly history by Singapore week and keeps the latest retailer snapshot in each week", async () => {
    const findMany = vi.fn(async () => [
      snapshotRow({
        retailerSlug: "redmart",
        retailerName: "RedMart",
        price: "12.12",
        originalPrice: "13.50",
        promotionText: "Any 3 Save $13.85",
        capturedAt: "2026-06-03T03:00:00.000Z"
      }),
      snapshotRow({
        retailerSlug: "redmart",
        retailerName: "RedMart",
        price: "12.50",
        promotionText: null,
        capturedAt: "2026-06-01T02:00:00.000Z"
      }),
      snapshotRow({
        retailerSlug: "redmart",
        retailerName: "RedMart",
        price: "12.15",
        promotionText: null,
        capturedAt: "2026-05-28T08:00:00.000Z"
      }),
      snapshotRow({
        retailerSlug: "fairprice",
        retailerName: "FairPrice",
        price: "12.11",
        promotionText: "Any 2 for $19.80",
        capturedAt: "2026-06-02T08:00:00.000Z"
      })
    ]);

    await expect(
      getCachedWeeklyPriceHistory(
        { priceSnapshot: { findMany } },
        { productSlug: "magnum-mini-almond-6x55ml" }
      )
    ).resolves.toMatchObject({
      page: 1,
      pageSize: 10,
      totalPages: 1,
      totalRows: 3,
      rows: [
        {
          retailerSlug: "redmart",
          price: 12.12,
          originalPrice: 13.5,
          promotionText: "Any 3 Save $13.85",
          weekStart: "2026-06-01",
          capturedAt: "2026-06-03T03:00:00.000Z"
        },
        {
          retailerSlug: "fairprice",
          price: 12.11,
          effectivePrice: 9.9,
          weekStart: "2026-06-01"
        },
        {
          retailerSlug: "redmart",
          price: 12.15,
          weekStart: "2026-05-25",
          capturedAt: "2026-05-28T08:00:00.000Z"
        }
      ]
    });
  });

  it("infers a simple savings label when a cached row has original and current prices but no promo text", async () => {
    const findMany = vi.fn(async () => [
      snapshotRow({
        retailerSlug: "redmart",
        retailerName: "RedMart",
        price: "16.08",
        originalPrice: "19.12",
        promotionText: null,
        capturedAt: "2026-06-03T03:00:00.000Z"
      })
    ]);

    await expect(
      getCachedLatestPrices({
        priceSnapshot: { findMany }
      })
    ).resolves.toMatchObject([
      {
        retailerSlug: "redmart",
        price: 16.08,
        originalPrice: 19.12,
        promotionText: "Save $3.04",
        statusMessage: null
      }
    ]);
  });

  it("filters, searches, sorts, and paginates weekly history rows", async () => {
    const findMany = vi.fn(async () => [
      snapshotRow({
        retailerSlug: "redmart",
        retailerName: "RedMart",
        price: "12.12",
        promotionText: "Any 3 Save $13.85",
        capturedAt: "2026-06-03T03:00:00.000Z"
      }),
      snapshotRow({
        retailerSlug: "redmart",
        retailerName: "RedMart",
        price: "13.20",
        promotionText: "No discount",
        capturedAt: "2026-05-27T03:00:00.000Z"
      }),
      snapshotRow({
        retailerSlug: "fairprice",
        retailerName: "FairPrice",
        price: "12.11",
        promotionText: "Any 2 for $19.80",
        capturedAt: "2026-06-02T08:00:00.000Z"
      })
    ]);

    await expect(
      getCachedWeeklyPriceHistory(
        { priceSnapshot: { findMany } },
        {
          productSlug: "magnum-mini-almond-6x55ml",
          retailerSlug: "redmart",
          query: "save",
          sort: "dealPrice",
          direction: "asc",
          page: 1,
          pageSize: 1
        }
      )
    ).resolves.toMatchObject({
      page: 1,
      pageSize: 1,
      totalPages: 1,
      totalRows: 1,
      rows: [
        {
          retailerSlug: "redmart",
          promotionText: "Any 3 Save $13.85",
          effectivePrice: 7.5033
        }
      ]
    });
  });
});

function snapshotRow({
  retailerSlug,
  retailerName,
  price,
  originalPrice = null,
  promotionText,
  capturedAt
}: {
  retailerSlug: string;
  retailerName: string;
  price: string;
  originalPrice?: string | null;
  promotionText: string | null;
  capturedAt: string;
}) {
  return {
    price,
    originalPrice,
    unitPrice: "0.03670",
    promotionText,
    currency: "SGD",
    isAvailable: true,
    capturedAt: new Date(capturedAt),
    retailerListing: {
      productUrl: `https://example.com/${retailerSlug}/magnum`,
      totalSize: 330,
      retailer: { slug: retailerSlug, name: retailerName },
      canonicalProduct: {
        slug: "magnum-mini-almond-6x55ml",
        packCount: 6,
        unitSize: 55,
        totalSize: 330,
        unit: "ml"
      }
    }
  };
}
