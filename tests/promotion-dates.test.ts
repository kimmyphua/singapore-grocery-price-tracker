import { describe, expect, it } from "vitest";
import {
  isPromotionExpired,
  parsePromotionDateRange
} from "@/lib/promotions/dates";

describe("promotion dates", () => {
  it("parses a full FairPrice range in Singapore time", () => {
    expect(parsePromotionDateRange("4 - 10 Jun 2026")).toEqual({
      validFrom: new Date("2026-06-03T16:00:00.000Z"),
      validTo: new Date("2026-06-10T15:59:59.999Z")
    });
  });

  it("accepts an en dash in a full range", () => {
    expect(parsePromotionDateRange("4 – 10 Jun 2026")).toEqual({
      validFrom: new Date("2026-06-03T16:00:00.000Z"),
      validTo: new Date("2026-06-10T15:59:59.999Z")
    });
  });

  it("parses a Cold Storage title with an inferred start date", () => {
    expect(
      parsePromotionDateRange("Grocery Selections (Till 10 June)", {
        referenceDate: new Date("2026-06-07T04:00:00.000Z"),
        defaultDurationDays: 7
      })
    ).toEqual({
      validFrom: new Date("2026-06-03T16:00:00.000Z"),
      validTo: new Date("2026-06-10T15:59:59.999Z")
    });
  });

  it("expires a promotion only after its Singapore end date", () => {
    const validTo = new Date("2026-06-10T15:59:59.999Z");

    expect(isPromotionExpired(validTo, validTo)).toBe(false);
    expect(
      isPromotionExpired(validTo, new Date("2026-06-10T16:00:00.000Z"))
    ).toBe(true);
  });

  it("rejects text without a validity range", () => {
    expect(() => parsePromotionDateRange("Weekly specials")).toThrow(
      "Promotion validity range was not found: Weekly specials"
    );
  });

  it("rejects unsupported promotion months", () => {
    expect(() => parsePromotionDateRange("4 - 10 Smarch 2026")).toThrow(
      "Unsupported promotion month: Smarch"
    );
  });
});
