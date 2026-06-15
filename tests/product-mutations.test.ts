import { describe, expect, it } from "vitest";
import {
  attachPendingRetailerListing,
  attachRetailerListing,
  createTrackedProduct,
  deleteTrackedProduct,
  detachRetailerListing,
  ProductMutationError,
  updateTrackedProduct,
  type ProductMutationStore
} from "@/lib/products/mutations";
import type { ProductPreview } from "@/lib/products/preview";

const preview: ProductPreview = {
  retailerSlug: "fairprice",
  canonicalUrl: "https://www.fairprice.com.sg/product/13142563",
  retailerSku: "13142563",
  titleRaw: "Magnum Mini Almond 6 x 55ml",
  name: "Magnum Mini Almond 6 x 55ml",
  brand: "Magnum",
  family: "Ice cream",
  flavour: "Almond",
  packCount: 6,
  unitSize: 55,
  unit: "ml",
  totalSize: 330,
  imageUrl: null,
  price: 9.9,
  originalPrice: 12.15,
  promotionText: "Any 2 @ $19.80",
  isAvailable: true
};

function createStore(overrides: Partial<ProductMutationStore> = {}) {
  const calls: string[] = [];
  const store: ProductMutationStore = {
    async transaction(operation, options) {
      calls.push(`transaction:${options.isolationLevel}`);
      return operation(store);
    },
    async countActiveProducts() {
      return 0;
    },
    async findRetailerBySlug(slug) {
      return { id: `retailer-${slug}`, slug };
    },
    async createProduct(data) {
      calls.push(`createProduct:${data.ownerId}`);
      return { id: "product-1", ...data };
    },
    async upsertListing(data) {
      calls.push(`upsertListing:${data.canonicalUrl}`);
      return { id: "listing-shared", retailerId: data.retailerId };
    },
    async upsertPendingListing(data) {
      calls.push(`upsertPendingListing:${data.canonicalUrl}`);
      return { id: "listing-pending", retailerId: data.retailerId };
    },
    async createProductListing(data) {
      calls.push(`join:${data.trackedProductId}:${data.retailerListingId}`);
    },
    async createSnapshot(data) {
      calls.push(`snapshot:${data.retailerListingId}:${data.price}`);
    },
    async createCompletedAttempt(data) {
      calls.push(`attempt:${data.retailerListingId}`);
    },
    async findOwnedProduct(id, ownerId) {
      if (id !== "product-1" || ownerId !== "owner-1") {
        return null;
      }
      return {
        id,
        ownerId,
        name: "Magnum Mini Almond 6 x 55ml",
        brand: "Magnum",
        family: "Ice cream",
        flavour: "Almond",
        packCount: 6,
        unitSize: 55,
        totalSize: 330,
        unit: "ml",
        imageUrl: null
      };
    },
    async updateOwnedProduct(id, ownerId) {
      return id === "product-1" && ownerId === "owner-1";
    },
    async deleteOwnedProduct(id, ownerId) {
      return id === "product-1" && ownerId === "owner-1";
    },
    async detachOwnedListing(productId, ownerId) {
      return productId === "product-1" && ownerId === "owner-1";
    },
    ...overrides
  };

  return { store, calls };
}

describe("createTrackedProduct", () => {
  it("creates the private product, shared listing, join, snapshot, and attempt atomically", async () => {
    const { store, calls } = createStore();

    await expect(
      createTrackedProduct(store, "owner-1", preview)
    ).resolves.toMatchObject({ id: "product-1", ownerId: "owner-1" });
    expect(calls).toEqual([
      "transaction:Serializable",
      "createProduct:owner-1",
      `upsertListing:${preview.canonicalUrl}`,
      "join:product-1:listing-shared",
      "snapshot:listing-shared:9.9",
      "attempt:listing-shared"
    ]);
  });

  it("enforces the 20-product limit inside the transaction", async () => {
    const { store, calls } = createStore({
      async countActiveProducts() {
        return 20;
      }
    });

    await expect(
      createTrackedProduct(store, "owner-1", preview)
    ).rejects.toMatchObject({
      code: "PRODUCT_LIMIT_REACHED"
    });
    expect(calls).toEqual(["transaction:Serializable"]);
  });

  it("revalidates the confirmed URL instead of trusting the client preview", async () => {
    const { store, calls } = createStore();

    await expect(
      createTrackedProduct(store, "owner-1", {
        ...preview,
        canonicalUrl: "https://attacker.example/internal"
      })
    ).rejects.toMatchObject({ code: "INVALID_PRODUCT" });
    expect(calls).toEqual([]);
  });
});

describe("owner-scoped product changes", () => {
  it("rejects cross-user edits and deletes", async () => {
    const { store } = createStore();

    await expect(
      updateTrackedProduct(store, "other-owner", "product-1", {
        name: "Changed"
      })
    ).rejects.toBeInstanceOf(ProductMutationError);
    await expect(
      deleteTrackedProduct(store, "other-owner", "product-1")
    ).rejects.toMatchObject({ code: "PRODUCT_FORBIDDEN" });
  });

  it("detaches only the owner's join", async () => {
    const { store } = createStore();

    await expect(
      detachRetailerListing(
        store,
        "owner-1",
        "product-1",
        "retailer-fairprice"
      )
    ).resolves.toBeUndefined();
    await expect(
      detachRetailerListing(
        store,
        "other-owner",
        "product-1",
        "retailer-fairprice"
      )
    ).rejects.toMatchObject({ code: "PRODUCT_FORBIDDEN" });
  });

  it("rejects an attached listing with conflicting identity", async () => {
    const { store } = createStore();

    await expect(
      attachRetailerListing(store, "owner-1", "product-1", {
        ...preview,
        brand: "Bulla"
      })
    ).rejects.toMatchObject({
      code: "IDENTITY_MISMATCH",
      details: {
        conflicts: [{ field: "brand" }]
      }
    });
  });

  it("attaches a conflicting listing after explicit user confirmation", async () => {
    const { store, calls } = createStore();

    await expect(
      attachRetailerListing(
        store,
        "owner-1",
        "product-1",
        {
          ...preview,
          brand: "Bulla"
        },
        { allowIdentityMismatch: true }
      )
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      "transaction:Serializable",
      `upsertListing:${preview.canonicalUrl}`,
      "join:product-1:listing-shared",
      "snapshot:listing-shared:9.9",
      "attempt:listing-shared"
    ]);
  });

  it("attaches a pending supported URL without inventing a price snapshot", async () => {
    const { store, calls } = createStore();
    const url =
      "https://www.lazada.sg/products/pdp-i301118872-s527230478.html?price=12.12";

    await expect(
      attachPendingRetailerListing(store, "owner-1", "product-1", url)
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      "transaction:Serializable",
      "upsertPendingListing:https://www.lazada.sg/products/pdp-i301118872-s527230478.html",
      "join:product-1:listing-pending"
    ]);
  });

  it("does not bypass identity checks for non-RedMart pending URLs", async () => {
    const { store, calls } = createStore();

    await expect(
      attachPendingRetailerListing(
        store,
        "owner-1",
        "product-1",
        "https://shengsiong.com.sg/product/unrelated-product-240-g"
      )
    ).rejects.toMatchObject({ code: "INVALID_PRODUCT" });
    expect(calls).toEqual([]);
  });
});
