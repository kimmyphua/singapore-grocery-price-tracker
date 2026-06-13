import { describe, expect, it } from "vitest";
import {
  buildProductPreview,
  ProductPreviewError
} from "@/lib/products/preview";

const supportedUrl = {
  retailerSlug: "fairprice" as const,
  canonicalUrl:
    "https://www.fairprice.com.sg/product/magnum-mini-almond-6-x-55ml-13034330"
};

const parsedProduct = {
  retailerSlug: "fairprice" as const,
  titleRaw: "Magnum Mini Almond Ice Cream Sticks 6 x 55ml",
  price: 9.9,
  originalPrice: 12.15,
  productUrl: supportedUrl.canonicalUrl,
  imageUrl: "https://example.com/magnum.jpg",
  isAvailable: true,
  retailerSku: "13034330",
  brandRaw: "Magnum",
  currency: "SGD",
  promotionText: "Any 2 @ $19.80",
  size: "6 x 55ml"
};

describe("buildProductPreview", () => {
  it("builds normalized confirmation data without raw page content", () => {
    expect(buildProductPreview(parsedProduct, supportedUrl)).toEqual({
      retailerSlug: "fairprice",
      canonicalUrl: supportedUrl.canonicalUrl,
      retailerSku: "13034330",
      titleRaw: "Magnum Mini Almond Ice Cream Sticks 6 x 55ml",
      name: "Magnum Mini Almond Ice Cream Sticks 6 x 55ml",
      brand: "Magnum",
      family: "Ice cream",
      flavour: "Almond",
      packCount: 6,
      unitSize: 55,
      unit: "ml",
      totalSize: 330,
      imageUrl: "https://example.com/magnum.jpg",
      price: 9.9,
      originalPrice: 12.15,
      promotionText: "Any 2 @ $19.80",
      isAvailable: true
    });
  });

  it.each([
    ["MISSING_TITLE", { titleRaw: " " }],
    ["MISSING_BRAND", { brandRaw: " " }],
    ["INVALID_PRICE", { price: 0 }],
    [
      "INVALID_PACK_SIZE",
      {
        titleRaw: "Magnum Almond Ice Cream",
        size: undefined
      }
    ]
  ] as const)("rejects %s preview data", (code, overrides) => {
    expect(() =>
      buildProductPreview(
        { ...parsedProduct, ...overrides },
        supportedUrl
      )
    ).toThrow(ProductPreviewError);
    expect(() =>
      buildProductPreview(
        { ...parsedProduct, ...overrides },
        supportedUrl
      )
    ).toThrow(code);
  });

  it("rejects parser output from a different retailer", () => {
    expect(() =>
      buildProductPreview(
        { ...parsedProduct, retailerSlug: "cold-storage" },
        supportedUrl
      )
    ).toThrow("RETAILER_MISMATCH");
  });
});
