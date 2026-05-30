import { describe, expect, it } from "vitest";
import {
  extractRedMartRenderedPrice,
  extractRedMartRenderedSize,
  extractRedMartPromotionText,
  extractRedMartPromotionTextFromApiPayload,
  parseRedMartProductPage
} from "@/lib/scraping/redmart-product-page";

describe("RedMart/Lazada product page parser", () => {
  it("extracts product data from Lazada pdp tracking data", () => {
    const html = `
      <meta property="og:image" content="https://img.lazcdn.com/magnum.webp" />
      <script>
        var pdpTrackingData = "{\\"brand_name\\":\\"Magnum\\",\\"pdt_sku\\":301118872,\\"pdt_simplesku\\":527230478,\\"pdt_name\\":\\"Magnum Mini Almond Multipack Ice Cream 6 x 55ml - Frozen\\",\\"core\\":{\\"currencyCode\\":\\"SGD\\"},\\"pdt_price\\":\\"$12.12\\"}";
      </script>
      <div>Promotions</div>
      <span>Spend $45.00 + free gift</span>
      <span>Any 3 Save 38%</span>
    `;

    expect(parseRedMartProductPage(html, "https://www.lazada.sg/products/pdp-i301118872-s527230478.html")).toEqual({
      retailerSlug: "redmart",
      titleRaw: "Magnum Mini Almond Multipack Ice Cream 6 x 55ml - Frozen",
      price: 12.12,
      productUrl: "https://www.lazada.sg/products/pdp-i301118872-s527230478.html",
      imageUrl: "https://img.lazcdn.com/magnum.webp",
      isAvailable: true,
      retailerSku: "527230478",
      brandRaw: "Magnum",
      currency: "SGD",
      promotionText: "Any 3 Save 38%; Spend $45.00 + free gift"
    });
  });

  it("uses URL sale price when Lazada tracking data keeps the original price", () => {
    const html = `
      <script>
        var pdpTrackingData = "{\\"brand_name\\":\\"Tillamook\\",\\"pdt_sku\\":577892355,\\"pdt_simplesku\\":1652060339,\\"pdt_name\\":\\"Tillamook Vanilla Bean Ice Cream - Frozen\\",\\"core\\":{\\"currencyCode\\":\\"SGD\\"},\\"pdt_price\\":\\"$19.12\\"}";
      </script>
    `;

    expect(
      parseRedMartProductPage(
        html,
        "https://www.lazada.sg/products/pdp-i577892355-s1652060339.html?price=16.08&stock=1"
      )
    ).toMatchObject({
      price: 16.08
    });
  });


  it("extracts promotions from browser-rendered text", () => {
    expect(
      extractRedMartPromotionText(`
        Promotions
        Spend $45.00 + free gift
        Any 3 Save 38%
        Any 3 Save 38%
      `)
    ).toBe("Any 3 Save 38%; Spend $45.00 + free gift");
  });

  it("extracts matching RedMart promotions from multibuy API payloads", () => {
    const payload = JSON.stringify({
      data: {
        modules: [
          {
            title: "Any 3 Save 38%",
            products: [
              {
                itemId: "3476860111",
                link: "//www.lazada.sg/products/pdp-i3476860111-s23012446237.html",
                skuId: "23012446237",
                tags: [{ text: "Spend $45 + Free Gift" }],
                title: "Magnum Mini White Chocolate Almond Mix 6x55ml - Frozen"
              },
              {
                itemId: "301118872",
                skuId: "527230478",
                title: "Magnum Mini Almond Multipack Ice Cream 6 x 55ml - Frozen"
              }
            ]
          }
        ]
      }
    });

    expect(
      extractRedMartPromotionTextFromApiPayload([payload], {
        productUrl: "https://www.lazada.sg/products/pdp-i3476860111-s23012446237.html",
        retailerSku: "23012446237",
        titleRaw: "Magnum Mini White Chocolate Almond Mix 6x55ml - Frozen"
      })
    ).toBe("Any 3 Save 38%; Spend $45 + Free Gift");
  });

  it("prefers browser-rendered sale price and pack size", () => {
    const renderedText = `
      Tillamook Vanilla Bean Ice Cream - Frozen
      Pack Size
      1.42 L
      $16.08
      $19.12
      -16%
      Only 49 items left
    `;

    expect(extractRedMartRenderedPrice(renderedText)).toBe(16.08);
    expect(extractRedMartRenderedSize(renderedText)).toBe("1.42 L");
  });
});
