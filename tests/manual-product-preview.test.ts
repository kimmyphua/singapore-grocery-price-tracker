import { describe, expect, it } from "vitest";
import { buildManualRetailerPreview } from "@/lib/products/manual-preview";

const product = {
  name: "Magnum Mini Ice Cream - Almond",
  brand: "Magnum",
  family: "Ice cream",
  flavour: "Almond",
  packCount: 6,
  unitSize: 55,
  unit: "ml",
  totalSize: 330,
  imageUrl: null
};

describe("manual retailer preview", () => {
  it("uses a Lazada URL price when one is present", () => {
    expect(
      buildManualRetailerPreview(
        "https://www.lazada.sg/products/pdp-i301118872-s527230478.html?price=12.12&stock=1",
        product
      )
    ).toMatchObject({
      retailerSlug: "redmart",
      canonicalUrl:
        "https://www.lazada.sg/products/pdp-i301118872-s527230478.html",
      retailerSku: "527230478",
      titleRaw: "Magnum Mini Ice Cream - Almond",
      price: 12.12,
      isAvailable: true
    });
  });

  it("leaves price empty for a bare Lazada URL", () => {
    expect(
      buildManualRetailerPreview(
        "https://www.lazada.sg/products/pdp-i301118872-s527230478.html",
        product
      ).price
    ).toBe(0);
  });

  it("rejects non-Lazada URLs", () => {
    expect(() =>
      buildManualRetailerPreview(
        "https://coldstorage.com.sg/product/magnum-mini-almond-6s",
        product
      )
    ).toThrow("MANUAL_FALLBACK_UNSUPPORTED");
  });
});
