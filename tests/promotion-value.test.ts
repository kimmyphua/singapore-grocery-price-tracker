import { describe, expect, it } from "vitest";
import { calculateBestValue } from "@/lib/pricing/promotion-value";

describe("promotion value calculation", () => {
  it("uses multibuy fixed-price offers for effective unit price", () => {
    expect(calculateBestValue(12.15, 330, "Any 2 @ $19.80")).toEqual({
      effectivePrice: 9.9,
      effectiveUnitPrice: 0.03,
      dealQuantity: 2
    });
  });

  it("accepts FairPrice fixed-price multibuy wording", () => {
    expect(calculateBestValue(12.11, 330, "Any 2 for $19.80")).toEqual({
      effectivePrice: 9.9,
      effectiveUnitPrice: 0.03,
      dealQuantity: 2
    });
  });

  it("uses percentage multibuy offers for effective unit price", () => {
    expect(calculateBestValue(12.12, 330, "Any 3 Save 38%")).toEqual({
      effectivePrice: 7.5144,
      effectiveUnitPrice: 0.02277,
      dealQuantity: 3
    });
  });

  it("ignores non-price promotions", () => {
    expect(calculateBestValue(12.95, 2, "Spend $45.00 + free gift")).toEqual({
      effectivePrice: 12.95,
      effectiveUnitPrice: 6.475,
      dealQuantity: 1
    });
  });
});
