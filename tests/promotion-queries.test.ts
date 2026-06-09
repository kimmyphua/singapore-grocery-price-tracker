import { describe, expect, it, vi } from "vitest";
import {
  getApprovedPromotionDeals,
  getPendingPromotionDeals,
  getPromotionReviewCounts,
  getRetailersWithApprovedPromotions
} from "@/lib/promotions/queries";

describe("promotion deal visibility queries", () => {
  const now = new Date("2026-06-07T05:00:00.000Z");
  const activeFlyerFilter = {
    flyer: {
      validFrom: { lte: now },
      validTo: { gte: now }
    }
  };

  it("public weekly deals only request approved items from active flyers", async () => {
    const findMany = vi.fn(async () => []);

    await getApprovedPromotionDeals({ category: "SNACKS", retailerSlug: "fairprice" }, {
      promotionDeal: { findMany }
    }, now);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reviewStatus: "APPROVED",
          category: "SNACKS",
          retailer: { slug: "fairprice" },
          ...activeFlyerFilter
        })
      })
    );
  });

  it("admin review queue only requests pending OCR candidates from active flyers", async () => {
    const findMany = vi.fn(async () => []);

    await getPendingPromotionDeals({ promotionDeal: { findMany } }, now);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reviewStatus: "PENDING",
          ...activeFlyerFilter
        }
      })
    );
  });

  it("review counts only include deals from active flyers", async () => {
    const count = vi.fn(async () => 0);

    await getPromotionReviewCounts({ promotionDeal: { findMany: vi.fn(), count } }, now);

    expect(count).toHaveBeenNthCalledWith(1, {
      where: {
        reviewStatus: "APPROVED",
        ...activeFlyerFilter
      }
    });
    expect(count).toHaveBeenNthCalledWith(2, {
      where: {
        reviewStatus: "REJECTED",
        ...activeFlyerFilter
      }
    });
  });

  it("retailer options only include approved deals from active flyers", async () => {
    const findMany = vi.fn(async () => []);

    await getRetailersWithApprovedPromotions({
      promotionDeal: { findMany: vi.fn() },
      retailer: { findMany }
    }, now);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        promotionDeals: {
          some: {
            reviewStatus: "APPROVED",
            ...activeFlyerFilter
          }
        }
      },
      orderBy: { name: "asc" }
    });
  });
});
