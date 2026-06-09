import { describe, expect, it, vi } from "vitest";
import { refreshWeeklyPromotions } from "@/lib/promotions/refresh-promotions";
import type {
  ExtractedPromotionDeal,
  PromotionDiscoveryResult,
  PromotionSeriesKey,
  PromotionSource
} from "@/lib/promotions/types";

const JUNE_4 = new Date("2026-06-04T00:00:00+08:00");
const JUNE_10 = new Date("2026-06-10T23:59:59+08:00");
const JUNE_11 = new Date("2026-06-11T00:00:00+08:00");

type StoredFlyer = {
  id: string;
  seriesKey: PromotionSeriesKey;
  validFrom: Date | null;
  validTo: Date | null;
};

function source(
  overrides: Partial<PromotionSource> = {}
): PromotionSource {
  return {
    seriesKey: "fairprice-must-buy",
    publicationKey: "fairprice-must-buy:2026-06-04",
    retailerSlug: "fairprice",
    title: "FairPrice Must Buy page 1",
    sourceUrl:
      "https://promotions.fairprice.com.sg/price-drop-buy-now-must-buy/page/1",
    assetUrl: "https://view.publitas.com/must-buy-page-1.jpg",
    assetKind: "image",
    parserKind: "fairprice-grid",
    pageNumber: 1,
    validFrom: JUNE_4,
    validTo: JUNE_10,
    ...overrides
  };
}

function deal(overrides: Partial<ExtractedPromotionDeal> = {}) {
  return {
    category: "SNACKS" as const,
    rawTitle: "LAYS Potato Chips",
    packText: "150g",
    priceText: "$3.95",
    parsedPrice: 3.95,
    promoText: "SAVE 20%",
    pageNumber: 99,
    confidence: 0.92,
    ...overrides
  };
}

function discovery(
  sources: PromotionSource[],
  failures: PromotionDiscoveryResult["failures"] = []
): PromotionDiscoveryResult {
  return { sources, failures };
}

function createClient(storedFlyers: StoredFlyer[] = []) {
  let createdFlyers = 0;
  const client = {
    retailer: {
      findUnique: vi.fn(async () => ({ id: "retailer_1" }))
    },
    promotionFlyer: {
      findMany: vi.fn(async () => storedFlyers),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({
        id: `new-flyer-${++createdFlyers}`
      }))
    },
    promotionDeal: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({
        count: data.length
      }))
    }
  };

  return client;
}

describe("weekly promotion refresh", () => {
  it("skips an unchanged publication before fetching its assets", async () => {
    const client = createClient([
      {
        id: "current-page-1",
        seriesKey: "fairprice-must-buy",
        validFrom: JUNE_4,
        validTo: JUNE_10
      }
    ]);
    const fetchAsset = vi.fn();
    const parseAsset = vi.fn();

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([source()]),
        fetchAsset,
        parseAsset
      }
    );

    expect(fetchAsset).not.toHaveBeenCalled();
    expect(parseAsset).not.toHaveBeenCalled();
    expect(client.promotionDeal.deleteMany).not.toHaveBeenCalled();
    expect(result.publicationsSkipped).toBe(1);
  });

  it("clears only the stale series before importing every page of a newer publication", async () => {
    const client = createClient([
      {
        id: "old-must-buy-page-1",
        seriesKey: "fairprice-must-buy",
        validFrom: new Date("2026-05-28T00:00:00+08:00"),
        validTo: new Date("2026-06-03T23:59:59+08:00")
      },
      {
        id: "old-must-buy-page-2",
        seriesKey: "fairprice-must-buy",
        validFrom: new Date("2026-05-28T00:00:00+08:00"),
        validTo: new Date("2026-06-03T23:59:59+08:00")
      },
      {
        id: "current-weekly-savers-page-1",
        seriesKey: "fairprice-weekly-savers",
        validFrom: JUNE_4,
        validTo: JUNE_10
      }
    ]);
    client.promotionDeal.deleteMany.mockResolvedValue({ count: 7 });
    const fetchAsset = vi.fn(async () => ({
      bytes: Buffer.from("new flyer"),
      contentType: "image/jpeg"
    }));
    const parseAsset = vi.fn(async () => [deal()]);
    const writeAsset = vi.fn(async () => "data/weekly-ads/fairprice/new.jpg");
    const pageTwo = source({
      title: "FairPrice Must Buy page 2",
      sourceUrl:
        "https://promotions.fairprice.com.sg/price-drop-buy-now-must-buy/page/2",
      assetUrl: "https://view.publitas.com/must-buy-page-2.jpg",
      pageNumber: 2
    });

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () =>
          discovery([pageTwo, source()]),
        fetchAsset,
        parseAsset,
        writeAsset
      }
    );

    expect(client.promotionDeal.deleteMany).toHaveBeenCalledTimes(1);
    expect(client.promotionDeal.deleteMany).toHaveBeenCalledWith({
      where: {
        flyerId: {
          in: ["old-must-buy-page-1", "old-must-buy-page-2"]
        }
      }
    });
    expect(client.promotionDeal.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(fetchAsset.mock.invocationCallOrder[0]);
    expect(client.promotionDeal.deleteMany).not.toHaveBeenCalledWith({
      where: {
        flyerId: {
          in: expect.arrayContaining(["current-weekly-savers-page-1"])
        }
      }
    });
    expect(fetchAsset).toHaveBeenCalledTimes(2);
    expect(parseAsset).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ parserKind: "fairprice-grid" })
    );
    expect(client.promotionFlyer.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          seriesKey: "fairprice-must-buy",
          validFrom: JUNE_4,
          validTo: JUNE_10
        })
      })
    );
    expect(client.promotionDeal.createMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: [expect.objectContaining({ pageNumber: 1 })]
      })
    );
    expect(client.promotionDeal.createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: [expect.objectContaining({ pageNumber: 2 })]
      })
    );
    expect(result).toEqual({
      publicationsDiscovered: 1,
      publicationsSkipped: 0,
      staleDealsRemoved: 7,
      flyersFetched: 2,
      candidatesCreated: 2,
      parseFailures: 0,
      failures: []
    });
  });

  it("keeps stale deals cleared and stores a failed flyer when replacement parsing fails", async () => {
    const client = createClient([
      {
        id: "old-must-buy-page-1",
        seriesKey: "fairprice-must-buy",
        validFrom: new Date("2026-05-28T00:00:00+08:00"),
        validTo: new Date("2026-06-03T23:59:59+08:00")
      }
    ]);
    client.promotionDeal.deleteMany.mockResolvedValue({ count: 4 });

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([source()]),
        fetchAsset: async () => ({
          bytes: Buffer.from("unreadable flyer"),
          contentType: "image/jpeg"
        }),
        parseAsset: async () => {
          throw new Error("No trustworthy deal cards found");
        },
        writeAsset: async () => "data/weekly-ads/fairprice/new.jpg"
      }
    );

    expect(client.promotionDeal.deleteMany).toHaveBeenCalledWith({
      where: { flyerId: { in: ["old-must-buy-page-1"] } }
    });
    expect(client.promotionFlyer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          seriesKey: "fairprice-must-buy",
          status: "PARSE_FAILED",
          errorMessage: "No trustworthy deal cards found"
        })
      })
    );
    expect(client.promotionDeal.createMany).not.toHaveBeenCalled();
    expect(result.staleDealsRemoved).toBe(4);
    expect(result.parseFailures).toBe(1);
    expect(result.failures).toEqual([
      {
        seriesKey: "fairprice-must-buy",
        message: "No trustworthy deal cards found"
      }
    ]);
  });

  it("clears an expired stored series when no replacement is discovered", async () => {
    const client = createClient([
      {
        id: "expired-cold-storage-page-1",
        seriesKey: "cold-storage-grocery-selections",
        validFrom: JUNE_4,
        validTo: JUNE_10
      }
    ]);
    client.promotionDeal.deleteMany.mockResolvedValue({ count: 5 });

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: JUNE_11,
        discoverSources: async () => discovery([])
      }
    );

    expect(client.promotionDeal.deleteMany).toHaveBeenCalledWith({
      where: {
        flyerId: { in: ["expired-cold-storage-page-1"] }
      }
    });
    expect(result.staleDealsRemoved).toBe(5);
  });

  it("clears an expired publication when discovery still returns the same stale dates", async () => {
    const client = createClient([
      {
        id: "expired-must-buy-page-1",
        seriesKey: "fairprice-must-buy",
        validFrom: JUNE_4,
        validTo: JUNE_10
      }
    ]);
    client.promotionDeal.deleteMany.mockResolvedValue({ count: 2 });
    const fetchAsset = vi.fn();

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: JUNE_11,
        discoverSources: async () => discovery([source()]),
        fetchAsset
      }
    );

    expect(client.promotionDeal.deleteMany).toHaveBeenCalledWith({
      where: { flyerId: { in: ["expired-must-buy-page-1"] } }
    });
    expect(fetchAsset).not.toHaveBeenCalled();
    expect(result.publicationsSkipped).toBe(1);
    expect(result.staleDealsRemoved).toBe(2);
  });

  it("clears an expired series even when discovery for that series fails", async () => {
    const client = createClient([
      {
        id: "expired-giant-page-1",
        seriesKey: "giant-super-savings",
        validFrom: JUNE_4,
        validTo: JUNE_10
      }
    ]);
    client.promotionDeal.deleteMany.mockResolvedValue({ count: 3 });

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: JUNE_11,
        discoverSources: async () =>
          discovery([], [
            {
              seriesKey: "giant-super-savings",
              message: "Giant promotion page request failed"
            }
          ])
      }
    );

    expect(client.promotionDeal.deleteMany).toHaveBeenCalledWith({
      where: { flyerId: { in: ["expired-giant-page-1"] } }
    });
    expect(result.failures).toEqual([
      {
        seriesKey: "giant-super-savings",
        message: "Giant promotion page request failed"
      }
    ]);
  });

  it("retains a still-valid series when discovery for that series fails", async () => {
    const client = createClient([
      {
        id: "current-cold-storage-page-1",
        seriesKey: "cold-storage-grocery-selections",
        validFrom: JUNE_4,
        validTo: JUNE_10
      }
    ]);

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () =>
          discovery([], [
            {
              seriesKey: "cold-storage-grocery-selections",
              message: "Cold Storage weekly ad unavailable"
            }
          ])
      }
    );

    expect(client.promotionDeal.deleteMany).not.toHaveBeenCalled();
    expect(result.failures).toEqual([
      {
        seriesKey: "cold-storage-grocery-selections",
        message: "Cold Storage weekly ad unavailable"
      }
    ]);
  });
});
