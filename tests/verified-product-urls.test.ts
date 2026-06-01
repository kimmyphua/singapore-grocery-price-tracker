import { describe, expect, it } from "vitest";
import { verifiedProductUrls } from "@/lib/data/verified-product-urls";

describe("verified product URLs", () => {
  it("does not trust Foodpanda search pages as product-level price sources", () => {
    expect(verifiedProductUrls.some((item) => item.url.includes("foodpanda.sg"))).toBe(false);
    expect(verifiedProductUrls.some((item) => item.retailerSlug === "giant")).toBe(false);
  });

  it("does not hardcode RedMart promotion fallback text", () => {
    const redMartUrls = verifiedProductUrls.filter((item) => item.url.includes("lazada.sg"));

    expect(redMartUrls.length).toBeGreaterThan(0);
    expect(redMartUrls.every((item) => item.fallbackPromotionText === undefined)).toBe(true);
  });
});
