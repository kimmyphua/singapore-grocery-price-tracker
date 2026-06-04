import { describe, expect, it, vi } from "vitest";
import { approvePendingPromotionDeals } from "@/lib/promotions/review-actions";

describe("promotion review actions", () => {
  it("bulk approves only pending promotion deals", async () => {
    const updateMany = vi.fn(async () => ({ count: 24 }));

    const result = await approvePendingPromotionDeals({
      promotionDeal: { updateMany }
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { reviewStatus: "PENDING" },
      data: { reviewStatus: "APPROVED" }
    });
    expect(result).toEqual({ approvedCount: 24 });
  });
});
