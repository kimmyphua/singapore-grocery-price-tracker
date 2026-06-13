import { describe, expect, it, vi } from "vitest";
import {
  refreshOwnerListings,
  refreshRetailerListing,
  runScheduledRefresh,
  type SharedListingRefreshStore
} from "@/lib/pricing/refresh-prices";

function createStore(
  overrides: Partial<SharedListingRefreshStore> = {}
) {
  const snapshots: unknown[] = [];
  const attempts: Array<Record<string, unknown>> = [];
  const store: SharedListingRefreshStore = {
    async withListingLock(_listingId, operation) {
      return { acquired: true, value: await operation(store) };
    },
    async findListing(id) {
      return {
        id,
        productUrl: "https://www.fairprice.com.sg/product/13142563",
        totalSize: 330,
        retailer: { slug: "fairprice", name: "FairPrice" }
      };
    },
    async createAttempt(data) {
      attempts.push({ id: "attempt-1", ...data, status: "STARTED" });
      return { id: `attempt-${attempts.length}` };
    },
    async updateListing() {},
    async createSnapshot(data) {
      snapshots.push(data);
    },
    async finishAttempt(id, data) {
      attempts.push({ id, ...data });
    },
    async resolveOwnerListingIds(ownerId, trackedProductId) {
      if (ownerId !== "owner-1") {
        return [];
      }
      if (trackedProductId && trackedProductId !== "product-1") {
        return [];
      }
      return ["listing-shared", "listing-shared"];
    },
    async listActiveListingIds() {
      return ["listing-1", "listing-2"];
    },
    ...overrides
  };
  return { store, snapshots, attempts };
}

const scraped = {
  retailerSlug: "fairprice" as const,
  titleRaw: "Magnum Mini Almond 6 x 55ml",
  price: 9.9,
  originalPrice: 12.15,
  productUrl: "https://www.fairprice.com.sg/product/13142563",
  imageUrl: "https://example.com/item.jpg",
  isAvailable: true,
  retailerSku: "13142563",
  brandRaw: "Magnum",
  currency: "SGD",
  promotionText: "Any 2 @ $19.80",
  size: "6 x 55ml"
};

describe("shared listing refresh", () => {
  it("scrapes and stores one snapshot for a URL shared by two joins", async () => {
    const { store, snapshots } = createStore();
    const scraper = vi.fn(async () => scraped);

    await expect(
      refreshOwnerListings(store, "owner-1", undefined, scraper)
    ).resolves.toMatchObject({ completed: 1, failed: 0 });
    expect(scraper).toHaveBeenCalledOnce();
    expect(snapshots).toHaveLength(1);
  });

  it("returns already locked without scraping", async () => {
    const { store } = createStore({
      async withListingLock() {
        return { acquired: false };
      }
    });
    const scraper = vi.fn(async () => scraped);

    await expect(
      refreshRetailerListing(store, "listing-1", "MANUAL", scraper)
    ).resolves.toEqual({ listingId: "listing-1", status: "ALREADY_LOCKED" });
    expect(scraper).not.toHaveBeenCalled();
  });

  it("records a failed attempt without deleting the prior snapshot", async () => {
    const { store, snapshots, attempts } = createStore();
    snapshots.push({ id: "prior-snapshot" });

    await expect(
      refreshRetailerListing(store, "listing-1", "MANUAL", async () => {
        throw new Error("selector failed with secret HTML");
      })
    ).resolves.toEqual({ listingId: "listing-1", status: "FAILED" });
    expect(snapshots).toEqual([{ id: "prior-snapshot" }]);
    expect(attempts).toContainEqual(
      expect.objectContaining({
        status: "FAILED",
        errorCategory: "SCRAPE_FAILED",
        errorMessage: "Retailer scrape failed"
      })
    );
  });

  it("continues scheduled refresh after one listing fails", async () => {
    const { store } = createStore();
    const scraper = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce(scraped);

    await expect(
      runScheduledRefresh(store, scraper)
    ).resolves.toEqual({
      total: 2,
      completed: 1,
      blocked: 0,
      failed: 1,
      alreadyLocked: 0
    });
    expect(scraper).toHaveBeenCalledTimes(2);
  });

  it("limits manual refresh to an owner-scoped product id", async () => {
    const { store } = createStore();
    const scraper = vi.fn(async () => scraped);

    await expect(
      refreshOwnerListings(
        store,
        "owner-1",
        "another-users-product",
        scraper
      )
    ).resolves.toMatchObject({ total: 0 });
    expect(scraper).not.toHaveBeenCalled();
  });
});
