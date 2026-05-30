import { describe, expect, it, vi } from "vitest";
import { refreshWeeklyPromotions } from "@/lib/promotions/refresh-promotions";

describe("weekly promotion refresh", () => {
  it("stores new flyers and pending deal candidates without touching price snapshots", async () => {
    const createFlyer = vi.fn(async () => ({ id: "flyer_1" }));
    const createManyDeals = vi.fn(async () => ({ count: 1 }));
    const priceSnapshotCreate = vi.fn();
    const client = {
      retailer: { findUnique: vi.fn(async () => ({ id: "retailer_1" })) },
      promotionFlyer: {
        findUnique: vi.fn(async () => null),
        create: createFlyer
      },
      promotionDeal: { createMany: createManyDeals },
      priceSnapshot: { create: priceSnapshotCreate }
    };

    const result = await refreshWeeklyPromotions(
      { retailerSlug: "cold-storage" },
      {
        client,
        discoverSources: async () => [
          {
            retailerSlug: "cold-storage",
            title: "Grocery Selections",
            sourceUrl: "https://coldstorage.com.sg/weekly-ads/Grocery-Selections",
            assetUrl: "https://example.com/flyer.pdf",
            assetKind: "pdf"
          }
        ],
        fetchAsset: async () => ({
          bytes: Buffer.from("flyer-one"),
          contentType: "application/pdf"
        }),
        parseAsset: async () => [
          {
            category: "SNACKS",
            rawTitle: "CHEETOS Corn Puff Snacks",
            packText: "200g",
            priceText: "$4.70",
            parsedPrice: 4.7,
            promoText: null,
            pageNumber: 1,
            confidence: 0.7
          }
        ],
        writeAsset: async () => "data/weekly-ads/test.pdf"
      }
    );

    expect(result).toEqual({ flyersFetched: 1, duplicatesSkipped: 0, candidatesCreated: 1, parseFailures: 0 });
    expect(createFlyer).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "IMPORTED" }) }));
    expect(createManyDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            reviewStatus: "PENDING",
            category: "SNACKS"
          })
        ]
      })
    );
    expect(priceSnapshotCreate).not.toHaveBeenCalled();
  });

  it("skips duplicate flyer assets by import hash", async () => {
    const client = {
      retailer: { findUnique: vi.fn(async () => ({ id: "retailer_1" })) },
      promotionFlyer: {
        findUnique: vi.fn(async () => ({ id: "existing_flyer", status: "IMPORTED", _count: { deals: 1 } })),
        create: vi.fn()
      },
      promotionDeal: {
        findMany: vi.fn(async () => [
          {
            rawTitle: "Magnum Mini",
            priceText: "$9.95",
            promoText: null,
            pageNumber: 1
          }
        ]),
        createMany: vi.fn()
      }
    };

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        discoverSources: async () => [
          {
            retailerSlug: "giant",
            title: "Super Savings",
            sourceUrl: "https://giant.sg/super-savings",
            assetUrl: "https://example.com/giant.pdf",
            assetKind: "pdf"
          }
        ],
        fetchAsset: async () => ({
          bytes: Buffer.from("duplicate"),
          contentType: "application/pdf"
        }),
        parseAsset: async () => [
          {
            category: "ICE_CREAM",
            rawTitle: "Magnum Mini",
            packText: null,
            priceText: "$9.95",
            parsedPrice: 9.95,
            promoText: null,
            pageNumber: 1,
            confidence: 0.66
          }
        ],
        writeAsset: vi.fn()
      }
    );

    expect(result.duplicatesSkipped).toBe(1);
    expect(client.promotionFlyer.create).not.toHaveBeenCalled();
    expect(client.promotionDeal.createMany).not.toHaveBeenCalled();
  });

  it("adds missing candidates when an existing flyer is reparsed with better coverage", async () => {
    const createManyDeals = vi.fn(async () => ({ count: 1 }));
    const client = {
      retailer: { findUnique: vi.fn(async () => ({ id: "retailer_1" })) },
      promotionFlyer: {
        findUnique: vi.fn(async () => ({
          id: "existing_flyer",
          status: "IMPORTED",
          assetPath: "data/weekly-ads/test.pdf",
          _count: { deals: 1 }
        })),
        create: vi.fn()
      },
      promotionDeal: {
        findMany: vi.fn(async () => [
          {
            rawTitle: "Magnum Mini",
            priceText: "$9.95",
            promoText: null,
            pageNumber: 1
          }
        ]),
        createMany: createManyDeals
      }
    };

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        discoverSources: async () => [
          {
            retailerSlug: "giant",
            title: "Super Savings",
            sourceUrl: "https://giant.sg/super-savings",
            assetUrl: "https://example.com/giant.pdf",
            assetKind: "pdf"
          }
        ],
        fetchAsset: async () => ({
          bytes: Buffer.from("duplicate"),
          contentType: "application/pdf"
        }),
        parseAsset: async () => [
          {
            category: "ICE_CREAM",
            rawTitle: "Magnum Mini",
            packText: null,
            priceText: "$9.95",
            parsedPrice: 9.95,
            promoText: null,
            pageNumber: 1,
            confidence: 0.66
          },
          {
            category: "SNACKS",
            rawTitle: "Lindt Chocolate",
            packText: "100g",
            priceText: "$7.95",
            parsedPrice: 7.95,
            promoText: "SAVE $3.35",
            pageNumber: 1,
            confidence: 0.9
          }
        ],
        writeAsset: vi.fn()
      }
    );

    expect(result).toEqual({ flyersFetched: 0, duplicatesSkipped: 0, candidatesCreated: 1, parseFailures: 0 });
    expect(createManyDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            rawTitle: "Lindt Chocolate",
            reviewStatus: "PENDING"
          })
        ]
      })
    );
  });

  it("retries duplicate flyer assets when the previous parse failed", async () => {
    const updateFlyer = vi.fn(async () => ({ id: "existing_flyer" }));
    const createManyDeals = vi.fn(async () => ({ count: 1 }));
    const client = {
      retailer: { findUnique: vi.fn(async () => ({ id: "retailer_1" })) },
      promotionFlyer: {
        findUnique: vi.fn(async () => ({
          id: "existing_flyer",
          status: "PARSE_FAILED",
          assetPath: "data/weekly-ads/test.pdf",
          _count: { deals: 0 }
        })),
        create: vi.fn(),
        update: updateFlyer
      },
      promotionDeal: { createMany: createManyDeals }
    };

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        discoverSources: async () => [
          {
            retailerSlug: "giant",
            title: "Super Savings",
            sourceUrl: "https://giant.sg/super-savings",
            assetUrl: "https://example.com/giant.pdf",
            assetKind: "pdf"
          }
        ],
        fetchAsset: async () => ({
          bytes: Buffer.from("duplicate"),
          contentType: "application/pdf"
        }),
        parseAsset: async () => [
          {
            category: "ICE_CREAM",
            rawTitle: "Magnum Mini",
            packText: null,
            priceText: "$9.95",
            parsedPrice: 9.95,
            promoText: null,
            pageNumber: 1,
            confidence: 0.66
          }
        ],
        writeAsset: vi.fn()
      }
    );

    expect(result).toEqual({ flyersFetched: 0, duplicatesSkipped: 0, candidatesCreated: 1, parseFailures: 0 });
    expect(updateFlyer).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing_flyer" },
        data: expect.objectContaining({ status: "IMPORTED", errorMessage: null })
      })
    );
    expect(createManyDeals).toHaveBeenCalled();
  });
});
