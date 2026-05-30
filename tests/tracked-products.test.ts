import { describe, expect, it } from "vitest";
import { products } from "@/lib/data/seed-data";
import { verifiedProductUrls } from "@/lib/data/verified-product-urls";

describe("tracked products", () => {
  it("tracks the requested Magnum variants and excludes removed chocolate bars", () => {
    const productSlugs = products.map((product) => product.slug);

    expect(productSlugs).toEqual([
      "magnum-mini-almond-6x55ml",
      "magnum-almond-3x110ml",
      "magnum-mini-white-chocolate-6x55ml",
      "bulla-vanilla-2l",
      "tillamook-ice-cream-1-42l"
    ]);
  });

  it("only refreshes verified URLs for currently tracked products", () => {
    const productSlugs = new Set(products.map((product) => product.slug));
    const urlProductSlugs = new Set(verifiedProductUrls.map((item) => item.productSlug));

    expect(urlProductSlugs).toEqual(productSlugs);
    expect([...urlProductSlugs]).not.toContain("kitkat-2-finger-10x15g");
    expect([...urlProductSlugs]).not.toContain("kinder-bueno-3x43g");
  });
});
