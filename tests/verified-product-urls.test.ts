import { describe, expect, it } from "vitest";
import { verifiedProductUrls } from "@/lib/data/verified-product-urls";

describe("verified product URLs", () => {
  it("does not trust Foodpanda search pages as product-level price sources", () => {
    expect(verifiedProductUrls.some((item) => item.url.includes("foodpanda.sg"))).toBe(false);
    expect(verifiedProductUrls.some((item) => item.retailerSlug === "giant")).toBe(false);
  });

  it("keeps verified RedMart multibuy fallback text when headless Lazada omits promotion labels", () => {
    expect(
      verifiedProductUrls.find(
        (item) => item.productSlug === "magnum-mini-white-chocolate-6x55ml" && item.url.includes("lazada.sg")
      )
    ).toMatchObject({
      fallbackPromotionText: "Any 3 Save 38%; Spend $45.00 + free gift"
    });
  });
});
