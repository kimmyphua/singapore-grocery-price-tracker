import { describe, expect, it } from "vitest";
import {
  extractRedMartRenderedPrice,
  extractRedMartRenderedSize,
  extractRedMartPrimaryPromotionText,
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
      originalPrice: null,
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
      price: 16.08,
      originalPrice: 19.12
    });
  });

  it("falls back to structured product data when tracking data is absent", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Magnum Mini Almond Multipack Ice Cream 6 x 55ml - Frozen",
          "sku": "527230478",
          "brand": { "@type": "Brand", "name": "Magnum" },
          "image": ["https://img.lazcdn.com/magnum.webp"],
          "offers": {
            "@type": "Offer",
            "price": "12.12",
            "priceCurrency": "SGD",
            "availability": "https://schema.org/InStock"
          }
        }
      </script>
    `;

    expect(
      parseRedMartProductPage(
        html,
        "https://www.lazada.sg/products/pdp-i301118872-s527230478.html"
      )
    ).toMatchObject({
      titleRaw: "Magnum Mini Almond Multipack Ice Cream 6 x 55ml - Frozen",
      retailerSku: "527230478",
      brandRaw: "Magnum",
      imageUrl: "https://img.lazcdn.com/magnum.webp",
      price: 12.12,
      currency: "SGD",
      isAvailable: true
    });
  });

  it("uses rendered product details when structured metadata is absent", () => {
    const renderedText = `
Groceries\tFrozen\tIce Cream\tPints\tThe Ice Cream & Cookie Co. Mint Chocolate Artisanal Gelato - 473ML(Frozen)
The Ice Cream & Cookie Co. Mint Chocolate Artisanal Gelato - 473ML(Frozen)
Ratings 450
Brand:The Ice Cream & Cookie Co.More Frozen from The Ice Cream & Cookie Co.

Pack Size

473 ml

$13.95
Promotions
Any 2 For $25.10
`;

    expect(
      parseRedMartProductPage(
        "<html><body></body></html>",
        "https://www.lazada.sg/products/pdp-i303316841-s536686006.html?price=13.95&stock=1",
        renderedText
      )
    ).toMatchObject({
      titleRaw:
        "The Ice Cream & Cookie Co. Mint Chocolate Artisanal Gelato - 473ML(Frozen)",
      brandRaw: "The Ice Cream & Cookie Co.",
      retailerSku: "536686006",
      price: 13.95,
      size: "473 ml"
    });
  });

  it("treats zero Lazada prices as missing instead of a real price", () => {
    const html = `
      <script>
        var pdpTrackingData = "{\\"brand_name\\":\\"Magnum\\",\\"pdt_sku\\":301118872,\\"pdt_simplesku\\":527230478,\\"pdt_name\\":\\"Magnum Mini Almond Multipack Ice Cream 6 x 55ml - Frozen\\",\\"core\\":{\\"currencyCode\\":\\"SGD\\"},\\"pdt_price\\":\\"$0.00\\"}";
      </script>
    `;

    expect(
      parseRedMartProductPage(
        html,
        "https://www.lazada.sg/products/pdp-i301118872-s527230478.html?price=0&stock=1"
      )
    ).toMatchObject({
      price: null,
      originalPrice: null
    });
  });


  it("extracts promotions from browser-rendered text", () => {
    expect(
      extractRedMartPromotionText(`
        Promotions
        Spend $45.00 + free gift
        Spend $45 + Free Gift
        Any 2 For $27.50
        Any 3 Save 38%
        Any 3 Save 38%
      `)
    ).toBe("Any 2 For $27.50; Any 3 Save 38%; Spend $45.00 + free gift");
  });

  it("ignores promotions for other products below the main RedMart offer", () => {
    expect(
      extractRedMartPrimaryPromotionText(`
        Promotions
        Spend $45.00 + free gift
        Sold by
        RedMart
        Any 2 Save 18%
      `)
    ).toBe("Spend $45.00 + free gift");
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
    ).toBe("Any 3 Save 38%; Spend $45.00 + free gift");
  });

  it("extracts fixed-value RedMart multibuy promotions from matching product tags", () => {
    const payload = JSON.stringify({
      data: {
        modules: [
          {
            title: "Any 3 Save $13.85",
            products: [
              {
                itemId: "301118872",
                skuId: "527230478",
                tags: [
                  {
                    backgroundColor: "#EE4054",
                    text: "Any 3 Save $13.85",
                    textColor: "#FFFFFF"
                  }
                ],
                title: "Magnum Mini Almond Multipack Ice Cream 6 x 55ml - Frozen"
              }
            ]
          }
        ]
      }
    });

    expect(
      extractRedMartPromotionTextFromApiPayload([payload], {
        productUrl: "https://www.lazada.sg/products/pdp-i301118872-s527230478.html",
        retailerSku: "527230478",
        titleRaw: "Magnum Mini Almond Multipack Ice Cream 6 x 55ml - Frozen"
      })
    ).toBe("Any 3 Save $13.85");
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

  it("treats zero browser-rendered prices as missing", () => {
    const renderedText = `
      Magnum Mini Almond Multipack Ice Cream 6 x 55ml - Frozen
      $0.00
      Promotions
    `;

    expect(extractRedMartRenderedPrice(renderedText)).toBeUndefined();
  });
});
