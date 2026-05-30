import { describe, expect, it, vi } from "vitest";
import { getCachedLatestPrices } from "@/lib/pricing/cached-prices";

describe("cached latest prices", () => {
  it("maps stored price snapshots into app latest-price rows without scraping", async () => {
    const findMany = vi.fn(async () => [
      {
        price: "12.11",
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
            retailer: {
              isActive: true
            }
          }
        }
      })
    );
  });
});
