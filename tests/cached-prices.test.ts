import { describe, expect, it, vi } from "vitest";
import type { TrackedProductQueryClient } from "@/lib/products/queries";
import {
  getCachedLatestPrices,
  getCachedWeeklyPriceHistory
} from "@/lib/pricing/cached-prices";

describe("owner cached prices", () => {
  it("maps the current owner's tracked product and latest shared snapshot", async () => {
    const client = createClient([
      productRow({
        id: "product-1",
        name: "My almond ice cream",
        snapshots: [
          snapshot({
            price: "12.11",
            originalPrice: "12.95",
            promotionText: "Any 2 for $19.80",
            capturedAt: "2026-05-28T08:00:00.000Z"
          })
        ]
      })
    ]);

    await expect(
      getCachedLatestPrices(client, { ownerId: "owner-1" })
    ).resolves.toEqual([
      {
        productId: "product-1",
        productName: "My almond ice cream",
        productSlug: "my-almond",
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
        productUrl: "https://www.fairprice.com.sg/product/13142563",
        isAvailable: true,
        scrapeStatus: "available",
        statusMessage: null,
        source: "cached-price-snapshot"
      }
    ]);
  });

  it("returns no rows without an authenticated owner id", async () => {
    const client = createClient([productRow({})]);

    await expect(getCachedLatestPrices(client)).resolves.toEqual([]);
    expect(client.trackedProduct.findMany).not.toHaveBeenCalled();
  });

  it("ignores inactive retailers and non-positive snapshots", async () => {
    const client = createClient([
      productRow({
        retailerActive: false,
        snapshots: [snapshot({ price: "9.00" })]
      }),
      productRow({
        id: "product-2",
        snapshots: [
          snapshot({ price: "0", capturedAt: "2026-06-04T00:00:00Z" }),
          snapshot({ price: "8.50", capturedAt: "2026-06-03T00:00:00Z" })
        ]
      })
    ]);

    await expect(
      getCachedLatestPrices(client, { ownerId: "owner-1" })
    ).resolves.toMatchObject([{ productId: "product-2", price: 8.5 }]);
  });

  it("infers a savings label when no promotion text is stored", async () => {
    const client = createClient([
      productRow({
        snapshots: [
          snapshot({
            price: "16.08",
            originalPrice: "19.12",
            promotionText: null
          })
        ]
      })
    ]);

    await expect(
      getCachedLatestPrices(client, { ownerId: "owner-1" })
    ).resolves.toMatchObject([
      {
        promotionText: "Save $3.04"
      }
    ]);
  });

  it("keeps only price, promotion, or availability changes in history", async () => {
    const client = createClient([
      productRow({
        snapshots: [
          snapshot({
            price: "12.12",
            promotionText: "Any 3 Save $13.85",
            capturedAt: "2026-06-03T03:00:00Z"
          }),
          snapshot({
            price: "12.12",
            promotionText: "Any 3 Save $13.85",
            capturedAt: "2026-06-02T03:00:00Z"
          }),
          snapshot({
            price: "12.50",
            capturedAt: "2026-06-01T03:00:00Z"
          })
        ]
      })
    ]);

    await expect(
      getCachedWeeklyPriceHistory(client, {
        ownerId: "owner-1",
        productSlug: "my-almond"
      })
    ).resolves.toMatchObject({
      totalRows: 2,
      rows: [
        { price: 12.12, date: "2026-06-03" },
        { price: 12.5, date: "2026-06-01" }
      ]
    });
  });

  it("filters, sorts, and paginates owner history", async () => {
    const client = createClient([
      productRow({
        snapshots: [
          snapshot({
            price: "12.12",
            promotionText: "Any 3 Save $13.85",
            capturedAt: "2026-06-03T03:00:00Z"
          }),
          snapshot({
            price: "13.20",
            promotionText: "No discount",
            capturedAt: "2026-05-27T03:00:00Z"
          })
        ]
      })
    ]);

    await expect(
      getCachedWeeklyPriceHistory(client, {
        ownerId: "owner-1",
        retailerSlug: "fairprice",
        query: "save",
        sort: "dealPrice",
        direction: "asc",
        page: 1,
        pageSize: 1
      })
    ).resolves.toMatchObject({
      totalRows: 1,
      pageSize: 1,
      rows: [{ promotionText: "Any 3 Save $13.85" }]
    });
  });
});

function createClient(rows: unknown[]) {
  return {
    trackedProduct: {
      findMany: vi.fn(async () => rows)
    }
  } as unknown as TrackedProductQueryClient;
}

function productRow({
  id = "product-1",
  name = "My almond ice cream",
  retailerActive = true,
  snapshots = [snapshot({})]
}: {
  id?: string;
  name?: string;
  retailerActive?: boolean;
  snapshots?: unknown[];
}) {
  return {
    id,
    ownerId: "owner-1",
    slug: "my-almond",
    name,
    brand: "Magnum",
    family: "Ice cream",
    flavour: "Almond",
    packCount: 6,
    unitSize: 55,
    unit: "ml",
    totalSize: 330,
    imageUrl: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    listings: [
      {
        id: `join-${id}`,
        trackedProductId: id,
        retailerListingId: "listing-1",
        retailerId: "retailer-1",
        createdAt: new Date(),
        retailerListing: {
          id: "listing-1",
          retailerId: "retailer-1",
          canonicalProductId: null,
          retailerSku: "13142563",
          titleRaw: "Magnum Mini Almond 6 x 55ml",
          brandRaw: "Magnum",
          imageUrl: null,
          productUrl: "https://www.fairprice.com.sg/product/13142563",
          normalizedBrand: "Magnum",
          normalizedFamily: "Ice cream",
          normalizedFlavour: "Almond",
          packCount: 6,
          unitSize: 55,
          unit: "ml",
          totalSize: 330,
          matchStatus: "AUTO_MATCHED",
          matchConfidence: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          retailer: {
            id: "retailer-1",
            slug: "fairprice",
            name: "FairPrice",
            baseUrl: "https://www.fairprice.com.sg",
            country: "SG",
            isActive: retailerActive,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          priceSnapshots: snapshots,
          scrapeAttempts: []
        }
      }
    ]
  };
}

function snapshot({
  price = "12.11",
  originalPrice = null,
  promotionText = null,
  capturedAt = "2026-06-03T03:00:00Z"
}: {
  price?: string;
  originalPrice?: string | null;
  promotionText?: string | null;
  capturedAt?: string;
}) {
  return {
    id: `snapshot-${capturedAt}-${price}`,
    retailerListingId: "listing-1",
    scrapeRunId: null,
    price,
    originalPrice,
    unitPrice: "0.03670",
    promotionText,
    currency: "SGD",
    isAvailable: true,
    capturedAt: new Date(capturedAt)
  };
}
