import { describe, expect, it, vi } from "vitest";
import {
  getTrackedProductRows,
  type TrackedProductQueryClient
} from "@/lib/products/queries";

describe("owner-rooted product queries", () => {
  it("queries only active products owned by the current profile", async () => {
    const findMany = vi.fn(async () => []);

    await getTrackedProductRows(
      { trackedProduct: { findMany } },
      "owner-1",
      { productSlug: "my-milk" }
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerId: "owner-1",
          isActive: true,
          slug: "my-milk"
        }
      })
    );
  });

  it("keeps a shared listing under each user's private product identity", async () => {
    const sharedListing = {
      id: "listing-1",
      productUrl: "https://www.fairprice.com.sg/product/13142563",
      totalSize: 1000,
      retailer: {
        id: "retailer-1",
        slug: "fairprice",
        name: "FairPrice",
        isActive: true
      },
      priceSnapshots: [
        {
          price: "4.50",
          originalPrice: null,
          unitPrice: "0.0045",
          promotionText: null,
          isAvailable: true,
          capturedAt: new Date("2026-06-12T00:00:00Z")
        }
      ],
      scrapeAttempts: []
    };
    const ownerOneClient = {
      trackedProduct: {
        findMany: vi.fn(async () => [
          trackedProductRow("product-1", "owner-1", "Breakfast milk", sharedListing)
        ])
      }
    };
    const ownerTwoClient = {
      trackedProduct: {
        findMany: vi.fn(async () => [
          trackedProductRow("product-2", "owner-2", "Coffee milk", sharedListing)
        ])
      }
    };

    const ownerOne = await getTrackedProductRows(
      ownerOneClient as unknown as TrackedProductQueryClient,
      "owner-1"
    );
    const ownerTwo = await getTrackedProductRows(
      ownerTwoClient as unknown as TrackedProductQueryClient,
      "owner-2"
    );

    expect(ownerOne[0]).toMatchObject({
      id: "product-1",
      ownerId: "owner-1",
      name: "Breakfast milk",
      listings: [{ retailerListing: sharedListing }]
    });
    expect(ownerTwo[0]).toMatchObject({
      id: "product-2",
      ownerId: "owner-2",
      name: "Coffee milk",
      listings: [{ retailerListing: sharedListing }]
    });
  });
});

function trackedProductRow(
  id: string,
  ownerId: string,
  name: string,
  retailerListing: Record<string, unknown>
) {
  return {
    id,
    ownerId,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    brand: "Example",
    family: "Milk",
    flavour: null,
    packCount: 1,
    unitSize: 1,
    unit: "l",
    totalSize: 1,
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
        retailerListing
      }
    ]
  };
}
