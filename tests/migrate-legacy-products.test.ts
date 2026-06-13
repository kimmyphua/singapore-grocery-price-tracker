import { describe, expect, it } from "vitest";
import {
  migrateLegacyProducts,
  type LegacyMigrationStore
} from "../scripts/migrate-legacy-products";

function createStore(ownerCount = 1) {
  const products = new Map<string, { id: string; ownerId: string; slug: string }>();
  const joins = new Set<string>();
  const legacyProducts = Array.from({ length: 5 }, (_, productIndex) => ({
    id: `canonical-${productIndex + 1}`,
    slug: `product-${productIndex + 1}`,
    brand: `Brand ${productIndex + 1}`,
    family: "Groceries",
    flavour: null,
    packCount: 1,
    unitSize: 100,
    unit: "g",
    totalSize: 100,
    listings: Array.from(
      { length: productIndex < 3 ? 3 : 2 },
      (_, listingIndex) => ({
        id: `listing-${productIndex + 1}-${listingIndex + 1}`,
        imageUrl: null
      })
    )
  }));

  const store: LegacyMigrationStore = {
    async findOwnerProfiles() {
      return Array.from({ length: ownerCount }, (_, index) => ({
        id: `owner-${index + 1}`
      }));
    },
    async listLegacyProducts() {
      return legacyProducts;
    },
    async upsertTrackedProduct(data) {
      const key = `${data.ownerId}:${data.slug}`;
      const existing = products.get(key);
      if (existing) {
        return existing;
      }
      const created = {
        id: `tracked-${products.size + 1}`,
        ownerId: data.ownerId,
        slug: data.slug
      };
      products.set(key, created);
      return created;
    },
    async upsertTrackedProductListing(data) {
      joins.add(`${data.trackedProductId}:${data.retailerListingId}`);
    }
  };

  return { store, products, joins };
}

describe("migrateLegacyProducts", () => {
  it("requires exactly one owner profile", async () => {
    await expect(
      migrateLegacyProducts(createStore(0).store, "owner@example.com")
    ).rejects.toThrow("LEGACY_OWNER_NOT_FOUND");
    await expect(
      migrateLegacyProducts(createStore(2).store, "owner@example.com")
    ).rejects.toThrow("LEGACY_OWNER_NOT_UNIQUE");
  });

  it("creates five owner products and thirteen listing joins", async () => {
    const { store, products, joins } = createStore();

    await expect(
      migrateLegacyProducts(store, "owner@example.com")
    ).resolves.toEqual({
      ownerId: "owner-1",
      productsProcessed: 5,
      listingsProcessed: 13
    });
    expect(products).toHaveLength(5);
    expect(joins).toHaveLength(13);
    expect([...products.values()].every((product) => product.ownerId === "owner-1"))
      .toBe(true);
  });

  it("is idempotent when rerun", async () => {
    const { store, products, joins } = createStore();

    await migrateLegacyProducts(store, "owner@example.com");
    await migrateLegacyProducts(store, "owner@example.com");

    expect(products).toHaveLength(5);
    expect(joins).toHaveLength(13);
  });
});
