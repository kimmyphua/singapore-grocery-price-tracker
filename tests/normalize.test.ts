import { describe, expect, it } from "vitest";
import {
  calculateUnitPrice,
  normalizeProductTitle,
  parsePackSize
} from "@/lib/products/normalize";

describe("product normalization", () => {
  it("parses pack count and gram size from chocolate bar titles", () => {
    expect(parsePackSize("KitKat 4 Finger Chocolate Bar 6 x 41.5g")).toEqual({
      packCount: 6,
      unitSize: 41.5,
      unit: "g",
      totalSize: 249
    });
  });

  it("parses ice cream tub volume from litre titles", () => {
    expect(parsePackSize("Bulla Creamy Classics Vanilla Ice Cream 2L")).toEqual({
      packCount: 1,
      unitSize: 2,
      unit: "l",
      totalSize: 2
    });
  });

  it("calculates unit price from total size", () => {
    expect(calculateUnitPrice(7.95, 249)).toBeCloseTo(0.0319, 4);
  });

  it("normalizes brand, family, flavour, and package details", () => {
    expect(
      normalizeProductTitle("Magnum Mini Almond Ice Cream Sticks 6 x 55ml")
    ).toMatchObject({
      brand: "Magnum",
      family: "Ice cream",
      flavour: "Almond",
      packCount: 6,
      unitSize: 55,
      unit: "ml",
      totalSize: 330
    });
  });

  it("normalizes spaced Kit Kat branding as KitKat", () => {
    expect(normalizeProductTitle("Kit Kat Milk Chocolate Block 160g")).toMatchObject({
      brand: "KitKat",
      family: "Chocolate",
      unitSize: 160,
      unit: "g",
      totalSize: 160
    });
  });
});
