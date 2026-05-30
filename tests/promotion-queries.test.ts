import { describe, expect, it, vi } from "vitest";
import { getApprovedPromotionDeals, getPendingPromotionDeals } from "@/lib/promotions/queries";

describe("promotion deal visibility queries", () => {
  it("public weekly deals only request approved review items", async () => {
    const findMany = vi.fn(async () => []);

    await getApprovedPromotionDeals({ category: "SNACKS", retailerSlug: "fairprice" }, {
      promotionDeal: { findMany }
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reviewStatus: "APPROVED",
          category: "SNACKS",
          retailer: { slug: "fairprice" }
        })
      })
    );
  });

  it("admin review queue only requests pending OCR candidates", async () => {
    const findMany = vi.fn(async () => []);

    await getPendingPromotionDeals({ promotionDeal: { findMany } });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reviewStatus: "PENDING" }
      })
    );
  });
});
