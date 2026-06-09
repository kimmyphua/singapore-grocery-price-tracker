import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  retailerId: string;
  sourceUrl: string;
  assetUrl: string;
  status: "IMPORTED" | "PARSE_FAILED";
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

function storedFlyer(overrides: Partial<StoredFlyer> = {}): StoredFlyer {
  return {
    id: "stored-page-1",
    seriesKey: "fairprice-must-buy",
    retailerId: "retailer_1",
    sourceUrl:
      "https://promotions.fairprice.com.sg/price-drop-buy-now-must-buy/page/1",
    assetUrl: "https://view.publitas.com/must-buy-page-1.jpg",
    status: "IMPORTED",
    validFrom: JUNE_4,
    validTo: JUNE_10,
    ...overrides
  };
}

function createClient(
  storedFlyers: StoredFlyer[] = [],
  existingHashFlyer: (StoredFlyer & { assetPath?: string }) | null = null
) {
  let createdFlyers = 0;
  const client = {
    retailer: {
      findUnique: vi.fn(async () => ({ id: "retailer_1" }))
    },
    promotionFlyer: {
      findMany: vi.fn(async () => storedFlyers),
      findUnique: vi.fn(async (_args: unknown) => existingHashFlyer),
      create: vi.fn(async () => ({
        id: `new-flyer-${++createdFlyers}`
      })),
      update: vi.fn(async () => ({ id: existingHashFlyer?.id ?? "updated" }))
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips an unchanged publication before fetching its assets", async () => {
    const client = createClient([
      storedFlyer({
        id: "current-page-1",
      })
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
      storedFlyer({
        id: "old-must-buy-page-1",
        validFrom: new Date("2026-05-28T00:00:00+08:00"),
        validTo: new Date("2026-06-03T23:59:59+08:00")
      }),
      storedFlyer({
        id: "old-must-buy-page-2",
        sourceUrl:
          "https://promotions.fairprice.com.sg/price-drop-buy-now-must-buy/page/2",
        assetUrl: "https://view.publitas.com/old-must-buy-page-2.jpg",
        validFrom: new Date("2026-05-28T00:00:00+08:00"),
        validTo: new Date("2026-06-03T23:59:59+08:00")
      }),
      storedFlyer({
        id: "current-weekly-savers-page-1",
        seriesKey: "fairprice-weekly-savers",
        sourceUrl:
          "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/page/1",
        assetUrl: "https://view.publitas.com/weekly-savers-page-1.jpg"
      })
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
      storedFlyer({
        id: "old-must-buy-page-1",
        validFrom: new Date("2026-05-28T00:00:00+08:00"),
        validTo: new Date("2026-06-03T23:59:59+08:00")
      })
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
      storedFlyer({
        id: "expired-cold-storage-page-1",
        seriesKey: "cold-storage-grocery-selections",
        sourceUrl: "https://coldstorage.com.sg/weekly-ads/Grocery-Selections-1",
        assetUrl: "https://coldstorage.com.sg/grocery-selections.jpg"
      })
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
      storedFlyer({
        id: "expired-must-buy-page-1",
      })
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
      storedFlyer({
        id: "expired-giant-page-1",
        seriesKey: "giant-super-savings",
        sourceUrl: "https://giant.sg/super-savings",
        assetUrl: "https://giant.sg/super-savings.pdf"
      })
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
    expect(result.parseFailures).toBe(0);
  });

  it("retains a still-valid series when discovery for that series fails", async () => {
    const client = createClient([
      storedFlyer({
        id: "current-cold-storage-page-1",
        seriesKey: "cold-storage-grocery-selections",
        sourceUrl: "https://coldstorage.com.sg/weekly-ads/Grocery-Selections-1",
        assetUrl: "https://coldstorage.com.sg/grocery-selections.jpg"
      })
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
    expect(result.parseFailures).toBe(0);
  });

  it("retries a same-date publication when a discovered page is missing", async () => {
    const client = createClient([
      storedFlyer({ id: "current-page-1" })
    ]);
    const fetchAsset = vi.fn(async () => ({
      bytes: Buffer.from("page"),
      contentType: "image/jpeg"
    }));
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
        discoverSources: async () => discovery([source(), pageTwo]),
        fetchAsset,
        parseAsset: async () => [deal()],
        writeAsset: async () => "data/flyer.jpg"
      }
    );

    expect(result.publicationsSkipped).toBe(0);
    expect(fetchAsset).toHaveBeenCalledOnce();
    expect(fetchAsset).toHaveBeenCalledWith(pageTwo);
    expect(client.promotionDeal.deleteMany).not.toHaveBeenCalled();
  });

  it("retries a same-date publication when a stored page previously failed parsing", async () => {
    const client = createClient([
      storedFlyer({ id: "failed-page-1", status: "PARSE_FAILED" })
    ]);
    const fetchAsset = vi.fn(async () => ({
      bytes: Buffer.from("page"),
      contentType: "image/jpeg"
    }));

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([source()]),
        fetchAsset,
        parseAsset: async () => [deal()],
        writeAsset: async () => "data/flyer.jpg"
      }
    );

    expect(result.publicationsSkipped).toBe(0);
    expect(fetchAsset).toHaveBeenCalledOnce();
  });

  it("removes only the superseded page when one same-date asset changes", async () => {
    const pageTwo = source({
      title: "FairPrice Must Buy page 2",
      sourceUrl:
        "https://promotions.fairprice.com.sg/price-drop-buy-now-must-buy/page/2",
      assetUrl: "https://view.publitas.com/must-buy-page-2-new.jpg",
      pageNumber: 2
    });
    const client = createClient([
      storedFlyer({ id: "current-page-1" }),
      storedFlyer({
        id: "old-page-2",
        sourceUrl: pageTwo.sourceUrl,
        assetUrl: "https://view.publitas.com/must-buy-page-2-old.jpg"
      })
    ]);
    client.promotionDeal.deleteMany.mockResolvedValue({ count: 4 });
    const fetchAsset = vi.fn(async () => ({
      bytes: Buffer.from("new page two"),
      contentType: "image/jpeg"
    }));

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([source(), pageTwo]),
        fetchAsset,
        parseAsset: async () => [deal()],
        writeAsset: async () => "data/page-2.jpg"
      }
    );

    expect(fetchAsset).toHaveBeenCalledOnce();
    expect(fetchAsset).toHaveBeenCalledWith(pageTwo);
    expect(client.promotionDeal.deleteMany).toHaveBeenCalledOnce();
    expect(client.promotionDeal.deleteMany).toHaveBeenCalledWith({
      where: { flyerId: { in: ["old-page-2"] } }
    });
    expect(result.staleDealsRemoved).toBe(4);
  });

  it("reuses an existing asset hash only for the same source identity", async () => {
    const hashFlyer = storedFlyer({
      id: "shared-hash-flyer",
      status: "PARSE_FAILED"
    });
    const client = createClient([], hashFlyer);
    client.promotionDeal.deleteMany.mockResolvedValue({ count: 1 });

    await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([source()]),
        fetchAsset: async () => ({
          bytes: Buffer.from("shared hash"),
          contentType: "image/jpeg"
        }),
        parseAsset: async () => [deal()]
      }
    );

    expect(client.promotionDeal.deleteMany).toHaveBeenCalledWith({
      where: { flyerId: { in: ["shared-hash-flyer"] } }
    });
    expect(client.promotionFlyer.update).toHaveBeenCalledWith({
      where: { id: "shared-hash-flyer" },
      data: expect.objectContaining({
        retailerId: "retailer_1",
        seriesKey: "fairprice-must-buy",
        sourceUrl: source().sourceUrl,
        assetUrl: source().assetUrl,
        validFrom: JUNE_4,
        validTo: JUNE_10,
        status: "IMPORTED",
        errorMessage: null
      }),
      select: { id: true }
    });
    expect(client.promotionDeal.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ flyerId: "shared-hash-flyer" })]
      })
    );
  });

  it("updates an existing asset hash to PARSE_FAILED when reparsing fails", async () => {
    const hashFlyer = storedFlyer({
      id: "shared-hash-flyer"
    });
    const client = createClient([], hashFlyer);
    client.promotionDeal.deleteMany.mockResolvedValue({ count: 2 });

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([source()]),
        fetchAsset: async () => ({
          bytes: Buffer.from("shared hash"),
          contentType: "image/jpeg"
        }),
        parseAsset: async () => {
          throw new Error("OCR failed");
        }
      }
    );

    expect(client.promotionDeal.deleteMany).toHaveBeenCalledWith({
      where: { flyerId: { in: ["shared-hash-flyer"] } }
    });
    expect(client.promotionFlyer.update).toHaveBeenCalledWith({
      where: { id: "shared-hash-flyer" },
      data: expect.objectContaining({
        seriesKey: "fairprice-must-buy",
        status: "PARSE_FAILED",
        errorMessage: "OCR failed"
      }),
      select: { id: true }
    });
    expect(client.promotionDeal.createMany).not.toHaveBeenCalled();
    expect(result.parseFailures).toBe(1);
  });

  it("does not find or mutate another retailer flyer with identical bytes", async () => {
    const bytes = Buffer.from("identical retailer image");
    const rawHash = createHash("sha256").update(bytes).digest("hex");
    const foreignFlyer = storedFlyer({
      id: "foreign-flyer",
      seriesKey: "fairprice-must-buy"
    });
    const client = createClient();
    client.promotionFlyer.findUnique.mockImplementation(
      async (args: unknown) => {
        const { where } = args as { where: { assetHash: string } };
        return where.assetHash === rawHash ? foreignFlyer : null;
      }
    );
    const coldStorageSource = source({
      seriesKey: "cold-storage-grocery-selections",
      publicationKey: "cold-storage-grocery-selections:2026-06-04",
      retailerSlug: "cold-storage",
      title: "Cold Storage Grocery Selections",
      sourceUrl:
        "https://coldstorage.com.sg/weekly-ads/Grocery-Selections-1",
      assetUrl: "https://coldstorage.com.sg/grocery-selections.jpg",
      assetKind: "image",
      parserKind: "document"
    });

    await refreshWeeklyPromotions(
      { retailerSlug: "cold-storage" },
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([coldStorageSource]),
        fetchAsset: async () => ({
          bytes,
          contentType: "image/jpeg"
        }),
        parseAsset: async () => [deal()],
        writeAsset: async () => "data/cold-storage.jpg"
      }
    );

    expect(client.promotionFlyer.findUnique).toHaveBeenCalledWith({
      where: { assetHash: expect.not.stringMatching(rawHash) },
      select: expect.any(Object)
    });
    expect(client.promotionFlyer.update).not.toHaveBeenCalled();
    expect(client.promotionDeal.deleteMany).not.toHaveBeenCalledWith({
      where: { flyerId: { in: ["foreign-flyer"] } }
    });
    expect(client.promotionFlyer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          seriesKey: "cold-storage-grocery-selections",
          assetHash: expect.not.stringMatching(rawHash)
        })
      })
    );
  });

  it("records fetch failures without incrementing parser failures", async () => {
    const client = createClient();

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([source()]),
        fetchAsset: async () => {
          throw new Error("upstream request failed");
        }
      }
    );

    expect(result.parseFailures).toBe(0);
    expect(result.failures).toEqual([
      {
        seriesKey: "fairprice-must-buy",
        message: "upstream request failed"
      }
    ]);
    expect(client.promotionFlyer.create).not.toHaveBeenCalled();
  });

  it("records archive failures while continuing with the remote asset URL", async () => {
    const client = createClient();

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([source()]),
        fetchAsset: async () => ({
          bytes: Buffer.from("remote-only flyer"),
          contentType: "image/jpeg"
        }),
        parseAsset: async () => [deal()],
        writeAsset: async () => {
          throw new Error("read-only filesystem");
        }
      }
    );

    expect(result.parseFailures).toBe(0);
    expect(result.failures).toEqual([
      {
        seriesKey: "fairprice-must-buy",
        message: "read-only filesystem"
      }
    ]);
    expect(client.promotionFlyer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assetPath: source().assetUrl,
          status: "IMPORTED"
        })
      })
    );
  });

  it("uses the remote asset URL on Vercel without attempting local archival", async () => {
    vi.stubEnv("VERCEL", "1");
    const client = createClient();

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([source()]),
        fetchAsset: async () => ({
          bytes: Buffer.from("serverless flyer"),
          contentType: "image/jpeg"
        }),
        parseAsset: async () => [deal()]
      }
    );

    expect(result.failures).toEqual([]);
    expect(client.promotionFlyer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assetPath: source().assetUrl,
          status: "IMPORTED"
        })
      })
    );
  });

  it("records deal persistence failures without marking the parsed flyer as failed", async () => {
    const client = createClient();
    client.promotionDeal.createMany.mockRejectedValue(
      new Error("deal insert failed")
    );

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([source()]),
        fetchAsset: async () => ({
          bytes: Buffer.from("parsed flyer"),
          contentType: "image/jpeg"
        }),
        parseAsset: async () => [deal()],
        writeAsset: async () => "data/flyer.jpg"
      }
    );

    expect(result.parseFailures).toBe(0);
    expect(result.failures).toEqual([
      {
        seriesKey: "fairprice-must-buy",
        message: "deal insert failed"
      }
    ]);
    expect(client.promotionFlyer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "IMPORTED" })
      })
    );
    expect(client.promotionFlyer.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PARSE_FAILED" })
      })
    );
  });

  it("limits stored flyer cleanup to the requested retailer", async () => {
    const client = createClient([
      storedFlyer({
        id: "expired-fairprice",
        validTo: new Date("2026-06-03T23:59:59+08:00")
      })
    ]);
    client.promotionFlyer.findMany.mockResolvedValueOnce([]);

    await refreshWeeklyPromotions(
      { retailerSlug: "cold-storage" },
      {
        client,
        now: JUNE_11,
        discoverSources: async () => discovery([])
      }
    );

    expect(client.promotionFlyer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { retailer: { slug: "cold-storage" } }
      })
    );
    expect(client.promotionDeal.deleteMany).not.toHaveBeenCalled();
  });

  it("imports only the newest discovered publication for each series", async () => {
    const client = createClient();
    const fetchAsset = vi.fn(async () => ({
      bytes: Buffer.from("newest"),
      contentType: "image/jpeg"
    }));
    const older = source({
      publicationKey: "fairprice-must-buy:2026-05-28",
      validFrom: new Date("2026-05-28T00:00:00+08:00"),
      validTo: new Date("2026-06-03T23:59:59+08:00"),
      assetUrl: "https://view.publitas.com/older.jpg"
    });

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([older, source()]),
        fetchAsset,
        parseAsset: async () => [deal()],
        writeAsset: async () => "data/flyer.jpg"
      }
    );

    expect(result.publicationsDiscovered).toBe(1);
    expect(fetchAsset).toHaveBeenCalledOnce();
    expect(fetchAsset).toHaveBeenCalledWith(source());
  });

  it("does not import an older discovered publication over a newer stored one", async () => {
    const client = createClient([
      storedFlyer({ id: "newer-stored-page" })
    ]);
    const fetchAsset = vi.fn();
    const older = source({
      publicationKey: "fairprice-must-buy:2026-05-28",
      validFrom: new Date("2026-05-28T00:00:00+08:00"),
      validTo: new Date("2026-06-03T23:59:59+08:00"),
      assetUrl: "https://view.publitas.com/older.jpg"
    });

    const result = await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-07T12:00:00+08:00"),
        discoverSources: async () => discovery([older]),
        fetchAsset
      }
    );

    expect(fetchAsset).not.toHaveBeenCalled();
    expect(result.publicationsSkipped).toBe(1);
  });

  it("clears expired dated deals even when a legacy null-validity row exists in the series", async () => {
    const client = createClient([
      storedFlyer({
        id: "expired-dated-page",
        validTo: JUNE_10
      }),
      storedFlyer({
        id: "legacy-null-page",
        sourceUrl: "https://legacy.example/flyer",
        assetUrl: "https://legacy.example/flyer.pdf",
        validFrom: null,
        validTo: null
      })
    ]);

    await refreshWeeklyPromotions(
      {},
      {
        client,
        now: JUNE_11,
        discoverSources: async () => discovery([])
      }
    );

    expect(client.promotionDeal.deleteMany).toHaveBeenCalledWith({
      where: {
        flyerId: { in: ["expired-dated-page", "legacy-null-page"] }
      }
    });
  });

  it("does not let a newer row with a null end date mask an expired dated publication", async () => {
    const client = createClient([
      storedFlyer({
        id: "expired-dated-page",
        validTo: JUNE_10
      }),
      storedFlyer({
        id: "legacy-newer-page",
        sourceUrl: "https://legacy.example/flyer",
        assetUrl: "https://legacy.example/flyer.pdf",
        validFrom: JUNE_11,
        validTo: null
      })
    ]);

    await refreshWeeklyPromotions(
      {},
      {
        client,
        now: new Date("2026-06-12T00:00:00+08:00"),
        discoverSources: async () => discovery([])
      }
    );

    expect(client.promotionDeal.deleteMany).toHaveBeenCalledWith({
      where: {
        flyerId: { in: ["expired-dated-page", "legacy-newer-page"] }
      }
    });
  });
});
