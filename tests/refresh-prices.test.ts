import { describe, expect, it, vi } from "vitest";
import { storeLatestPrices } from "@/lib/pricing/refresh-prices";
import type { LatestPrice } from "@/lib/data/seed-data";

describe("price refresh persistence", () => {
  it("stores live prices as retailer listings and price snapshots", async () => {
    const upsert = vi.fn(async () => ({ id: "listing_1" }));
    const create = vi.fn(async () => ({ id: "snapshot_1" }));
    const price: LatestPrice = {
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
      source: "live-product-page"
    };

    await expect(
      storeLatestPrices(
        {
          retailer: { findUnique: vi.fn(async () => ({ id: "retailer_1" })) },
          retailerListing: { upsert },
          priceSnapshot: { create }
        },
        [price]
      )
    ).resolves.toEqual({ stored: 1, skipped: 0 });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          retailerId_productUrl: {
            retailerId: "retailer_1",
            productUrl: "https://www.fairprice.com.sg/product/magnum"
          }
        }
      })
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          price: 12.11,
          originalPrice: 12.95,
          unitPrice: 0.0367,
          promotionText: "Any 2 for $19.80",
          isAvailable: true
        })
      })
    );
  });

  it("skips blocked rows without a concrete price", async () => {
    const upsert = vi.fn();
    const create = vi.fn();

    await expect(
      storeLatestPrices(
        {
          retailer: { findUnique: vi.fn(async () => ({ id: "retailer_1" })) },
          retailerListing: { upsert },
          priceSnapshot: { create }
        },
        [
          {
            productSlug: "blocked",
            retailerSlug: "redmart",
            retailerName: "RedMart",
            price: null,
            originalPrice: null,
            unitPrice: null,
            effectivePrice: null,
            effectiveUnitPrice: null,
            dealQuantity: 1,
            promotionText: null,
            capturedAt: "2026-05-28T08:00:00.000Z",
            productUrl: "https://example.com/blocked",
            isAvailable: false,
            scrapeStatus: "blocked",
            statusMessage: "Blocked",
            source: "live-product-page"
          }
        ]
      )
    ).resolves.toEqual({ stored: 0, skipped: 1 });

    expect(upsert).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("skips non-positive prices instead of storing broken snapshots", async () => {
    const upsert = vi.fn();
    const create = vi.fn();

    await expect(
      storeLatestPrices(
        {
          retailer: { findUnique: vi.fn(async () => ({ id: "retailer_1" })) },
          retailerListing: { upsert },
          priceSnapshot: { create }
        },
        [
          {
            productSlug: "magnum-mini-almond-6x55ml",
            retailerSlug: "redmart",
            retailerName: "RedMart",
            price: 0,
            originalPrice: null,
            unitPrice: 0,
            effectivePrice: 0,
            effectiveUnitPrice: 0,
            dealQuantity: 1,
            promotionText: null,
            capturedAt: "2026-05-28T08:00:00.000Z",
            productUrl: "https://www.lazada.sg/products/pdp-i301118872-s527230478.html",
            isAvailable: true,
            scrapeStatus: "available",
            statusMessage: null,
            source: "live-product-page"
          }
        ]
      )
    ).resolves.toEqual({ stored: 0, skipped: 1 });

    expect(upsert).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
