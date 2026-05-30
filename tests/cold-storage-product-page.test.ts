import { describe, expect, it } from "vitest";
import { parseColdStorageProductPage } from "@/lib/scraping/cold-storage-product-page";

describe("Cold Storage product page parser", () => {
  it("extracts product data from the embedded product payload", () => {
    const html = `
      <meta property="og:title" content="Magnum Mini Almond Ice Cream Sticks 6 x 55ml  | Cold Storage"/>
      <meta property="og:image" content="https://mcos.coldstorage.com.sg/uploads/product/6387/005006124.jpg"/>
      <script>
        self.__next_f.push([1,"\\"product\\":{\\"productId\\":147300,\\"name\\":\\"Magnum Mini Almond Ice Cream Sticks 6 x 55ml\\",\\"slug\\":\\"magnum-mini-almond-6s\\",\\"price\\":12.15,\\"promoPrice\\":12.15,\\"image\\":\\"https://mcos.coldstorage.com.sg/uploads/product/6387/005006124.jpg\\",\\"inventoryStatus\\":\\"In Stock\\",\\"discountLabel\\":\\"Any 2 @ $19.80\\",\\"sku\\":\\"005006124\\",\\"size\\":\\"6 x 55ml\\",\\"country\\":\\"Germany\\"}"]);
      </script>
    `;

    expect(parseColdStorageProductPage(html, "https://coldstorage.com.sg/product/magnum-mini-almond-6s")).toEqual({
      retailerSlug: "cold-storage",
      titleRaw: "Magnum Mini Almond Ice Cream Sticks 6 x 55ml",
      price: 12.15,
      productUrl: "https://coldstorage.com.sg/product/magnum-mini-almond-6s",
      imageUrl: "https://mcos.coldstorage.com.sg/uploads/product/6387/005006124.jpg",
      isAvailable: true,
      retailerSku: "005006124",
      brandRaw: "Magnum",
      currency: "SGD",
      promotionText: "Any 2 @ $19.80",
      size: "6 x 55ml"
    });
  });
});
