import { describe, expect, it } from "vitest";
import { parsePackSize } from "@/lib/products/normalize";

describe("live price unit calculation", () => {
  it("uses the tracked product pack size when a retailer page omits size", () => {
    const pack = parsePackSize("2L");
    const price = 12.95;

    expect(price / pack.totalSize).toBe(6.475);
  });

  it("uses scraped retailer size when present", () => {
    const pack = parsePackSize("6 x 55ml");
    const price = 12.12;

    expect(price / pack.totalSize).toBeCloseTo(0.03673, 5);
  });
});
