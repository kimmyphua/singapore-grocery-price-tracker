import { describe, expect, it } from "vitest";
import { parseShengSiongProduct } from "@/lib/scraping/sheng-siong-product-page";

describe("Sheng Siong product adapter", () => {
  it("maps the public storefront product response", () => {
    expect(
      parseShengSiongProduct(
        {
          _id: { $type: "oid", $value: "c42bc08ccb38cdec6923c532" },
          itemCode: "206432",
          brand: "Tasty Bites",
          name: "Handmade Fried Fish Bean curd",
          packSize: "240 g",
          price: 4.65,
          prevPrice: 6.88,
          isArchived: false,
          listingOnEcomm: true,
          isSoldOut: false,
          imgKey: "7qcvBS2QmE110GZflQzoBPUwO21PiT",
          tag: ""
        },
        "https://shengsiong.com.sg/product/tasty-bites-handmade-fried-fish-bean-curd-240-g"
      )
    ).toMatchObject({
      retailerSlug: "sheng-siong",
      titleRaw: "Tasty Bites Handmade Fried Fish Bean curd 240 g",
      price: 4.65,
      originalPrice: 6.88,
      retailerSku: "206432",
      brandRaw: "Tasty Bites",
      size: "240 g",
      isAvailable: true,
      imageUrl:
        "https://ssecomm.s3.ap-southeast-1.amazonaws.com/products/md/7qcvBS2QmE110GZflQzoBPUwO21PiT.0.jpg"
    });
  });

  it("marks archived, unlisted, or sold-out products unavailable", () => {
    expect(
      parseShengSiongProduct(
        {
          itemCode: "206432",
          brand: "Tasty Bites",
          name: "Fish Bean curd",
          packSize: "240 g",
          price: 4.65,
          isArchived: false,
          listingOnEcomm: true,
          isSoldOut: true
        },
        "https://shengsiong.com.sg/product/tasty-bites-fish-bean-curd-240-g"
      ).isAvailable
    ).toBe(false);
  });

  it("rejects incomplete storefront responses", () => {
    expect(() =>
      parseShengSiongProduct(
        { name: "Fish Bean curd", packSize: "240 g", price: 4.65 },
        "https://shengsiong.com.sg/product/tasty-bites-fish-bean-curd-240-g"
      )
    ).toThrow("INVALID_SHENG_SIONG_PRODUCT");
  });
});
