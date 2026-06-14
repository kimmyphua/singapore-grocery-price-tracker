import { describe, expect, it } from "vitest";
import {
  buildProductPreview,
  ProductPreviewError,
  previewProductUrl
} from "@/lib/products/preview";
import { vi } from "vitest";

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

  it("skips the scheduled scraper delay for interactive previews", async () => {
    const fetchPage = vi.fn().mockResolvedValue("<html></html>");
    const parsePage = vi.fn().mockReturnValue(parsedProduct);

    await previewProductUrl(supportedUrl.canonicalUrl, {
      fetchPage,
      parsePage
    });

    expect(fetchPage).toHaveBeenCalledWith(
      supportedUrl.canonicalUrl,
      { delayMs: 0 }
    );
  });

  it("uses the browser scraper for RedMart live prices and promotions", async () => {
    const fetchPage = vi.fn();
    const scrapeRedMart = vi.fn().mockResolvedValue({
      retailerSlug: "redmart",
      titleRaw: "Magnum Mini Almond Multipack Ice Cream 6 x 55ml - Frozen",
      price: 7.55,
      originalPrice: 12.12,
      productUrl:
        "https://www.lazada.sg/products/pdp-i301118872-s527230478.html",
      isAvailable: true,
      retailerSku: "527230478",
      brandRaw: "Magnum",
      currency: "SGD",
      promotionText: "Spend $45.00 + free gift"
    });

    await expect(
      previewProductUrl(
        "https://www.lazada.sg/products/pdp-i301118872-s527230478.html",
        { fetchPage, scrapeRedMart }
      )
    ).resolves.toMatchObject({
      price: 7.55,
      originalPrice: 12.12,
      promotionText: "Spend $45.00 + free gift"
    });

    expect(scrapeRedMart).toHaveBeenCalledWith(
      "https://www.lazada.sg/products/pdp-i301118872-s527230478.html"
    );
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("uses the Sheng Siong adapter instead of fetching the shell page", async () => {
    const scrapeShengSiong = vi.fn().mockResolvedValue({
      ...parsedProduct,
      retailerSlug: "sheng-siong",
      productUrl:
        "https://shengsiong.com.sg/product/tasty-bites-handmade-fried-fish-bean-curd-240-g",
      titleRaw: "Tasty Bites Handmade Fried Fish Bean curd 240 g",
      brandRaw: "Tasty Bites",
      price: 4.65,
      originalPrice: 6.88,
      size: "240 g"
    });
    const fetchPage = vi.fn();

    await expect(
      previewProductUrl(
        "https://shengsiong.com.sg/product/tasty-bites-handmade-fried-fish-bean-curd-240-g",
        { fetchPage, scrapeShengSiong }
      )
    ).resolves.toMatchObject({
      retailerSlug: "sheng-siong",
      price: 4.65,
      originalPrice: 6.88
    });
    expect(scrapeShengSiong).toHaveBeenCalledWith(
      "https://shengsiong.com.sg/product/tasty-bites-handmade-fried-fish-bean-curd-240-g"
    );
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
