import { describe, expect, it } from "vitest";
import { parseFairPriceProductPage } from "@/lib/scraping/fairprice-product-page";

describe("FairPrice product page parser", () => {
  it("extracts product JSON-LD from a FairPrice product page", () => {
    const html = `
      <html>
        <head>
          <meta name="description" content="Any 2 for $19.80. Grab now before 1 Jun 2026!" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org/",
              "@type": "Product",
              "name": "Bulla Creamy Classics Ice Cream - Vanilla",
              "image": ["https://media.nedigital.sg/fairprice/fpol/media/images/product/XL/11491431_XL1_20250911.jpg"],
              "sku": "176888",
              "brand": { "@type": "Thing", "name": "Bulla" },
              "offers": {
                "@type": "Offer",
                "url": "https://omni.fairprice.com.sg/product/11491431",
                "priceCurrency": "SGD",
                "price": "12.95",
                "availability": " https://schema.org/OutOfStock"
              }
            }
          </script>
        </head>
        <body>
          Bulla Creamy Classics Ice Cream - Vanilla
          2L|Brand:Bulla
          Any 2 for $19.80
          Frequently Bought Together
          Any 2 for $13.80
          Any 2 for $9.00
        </body>
      </html>
    `;

    expect(parseFairPriceProductPage(html, "https://www.fairprice.com.sg/product/11491431")).toEqual({
      retailerSlug: "fairprice",
      titleRaw: "Bulla Creamy Classics Ice Cream - Vanilla",
      price: 12.95,
      originalPrice: null,
      productUrl: "https://www.fairprice.com.sg/product/11491431",
      imageUrl: "https://media.nedigital.sg/fairprice/fpol/media/images/product/XL/11491431_XL1_20250911.jpg",
      isAvailable: false,
      retailerSku: "176888",
      brandRaw: "Bulla",
      currency: "SGD",
      promotionText: "Any 2 for $19.80",
      size: "2L"
    });
  });

  it("keeps the crossed-out FairPrice price when an offer price is shown", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org/",
          "@type": "Product",
          "name": "Tillamook Ice Cream - Vanilla Bean",
          "sku": "1359122",
          "brand": { "@type": "Thing", "name": "Tillamook" },
          "offers": {
            "priceCurrency": "SGD",
            "price": "15.20",
            "availability": "https://schema.org/OutOfStock"
          }
        }
      </script>
      <body>
        Offer $15.20 $15.53 Save $0.33 Till 1st Jul 2026
        Tillamook Ice Cream - Vanilla Bean 1.42L | Brand: Tillamook
      </body>
      <script>
        self.__next_data = {
          "products": [{
            "name": "Tillamook Ice Cream - Vanilla Bean",
            "storeSpecificData": [{
              "productId": 13198654,
              "mrp": "18.00"
            }]
          }, {
            "name": "Tillamook Ice Cream - Vanilla Bean",
            "storeSpecificData": [{
              "productId": 1359122,
              "mrp": "15.53",
              "discount": "0.33"
            }]
          }]
        };
      </script>
    `;

    expect(
      parseFairPriceProductPage(
        html,
        "https://www.fairprice.com.sg/product/tillamook-ice-cream-vanilla-bean-1-42l-13198654"
      )
    ).toMatchObject({
      price: 15.2,
      originalPrice: 15.53,
      promotionText: "Save $0.33 Till 1st Jul 2026"
    });
  });

  it("tolerates FairPrice JSON-LD with an extra trailing brace", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org/",
          "@type": "Product",
          "name": "Bulla Creamy Classics Ice Cream - Vanilla",
          "offers": { "priceCurrency": "SGD", "price": "12.95" }
        }
        }
      </script>
    `;

    expect(
      parseFairPriceProductPage(html, "https://www.fairprice.com.sg/product/11491431")
    ).toMatchObject({
      titleRaw: "Bulla Creamy Classics Ice Cream - Vanilla",
      price: 12.95
    });
  });

  it("ignores offers from other embedded FairPrice products", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org/",
          "@type": "Product",
          "name": "Nestle Kit Kat 2 Finger Chocolate Bar - Milk",
          "sku": "1592311",
          "offers": {
            "priceCurrency": "SGD",
            "price": "7.45",
            "availability": "https://schema.org/InStock"
          }
        }
      </script>
      <script>
        self.__next_data = {
          "products": [
            {
              "name": "Nestle Kit Kat Chunky Mini Moments - Assorted",
              "offers": [{"description":"Any 2 for $16.00"}]
            },
            {
              "item":{"id":1592311},
              "name":"Nestle Kit Kat 2 Finger Chocolate Bar - Milk",
              "offers":null,
              "storeSpecificData":[{"discount":"0"}]
            }
          ]
        };
      </script>
    `;

    expect(
      parseFairPriceProductPage(
        html,
        "https://www.fairprice.com.sg/product/nestle-kit-kat-2-finger-chocolate-bar-milk-sharebag-10-x-15g-13273564"
      )
    ).toMatchObject({
      titleRaw: "Nestle Kit Kat 2 Finger Chocolate Bar - Milk",
      price: 7.45,
      promotionText: undefined
    });
  });
});
