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

  it("parses a cross-year range with both endpoint years", () => {
    expect(parsePromotionDateRange("28 Dec 2026 - 3 Jan 2027")).toEqual({
      validFrom: new Date("2026-12-27T16:00:00.000Z"),
      validTo: new Date("2027-01-03T15:59:59.999Z")
    });
  });

  it("infers a missing start year from the dated end endpoint", () => {
    expect(parsePromotionDateRange("28 Dec - 3 Jan 2027")).toEqual({
      validFrom: new Date("2026-12-27T16:00:00.000Z"),
      validTo: new Date("2027-01-03T15:59:59.999Z")
    });
  });

  it("infers a missing end year from the dated start endpoint", () => {
    expect(parsePromotionDateRange("28 Dec 2026 - 3 Jan")).toEqual({
      validFrom: new Date("2026-12-27T16:00:00.000Z"),
      validTo: new Date("2027-01-03T15:59:59.999Z")
    });
  });

  it("infers both endpoint years near the Singapore reference date", () => {
    expect(
      parsePromotionDateRange("28 Dec - 3 Jan", {
        referenceDate: new Date("2026-12-30T04:00:00.000Z")
      })
    ).toEqual({
      validFrom: new Date("2026-12-27T16:00:00.000Z"),
      validTo: new Date("2027-01-03T15:59:59.999Z")
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

  it("infers the nearby next year for a January till date in December", () => {
    expect(
      parsePromotionDateRange("Grocery Selections (Till 3 January)", {
        referenceDate: new Date("2026-12-30T04:00:00.000Z"),
        defaultDurationDays: 7
      })
    ).toEqual({
      validFrom: new Date("2026-12-27T16:00:00.000Z"),
      validTo: new Date("2027-01-03T15:59:59.999Z")
    });
  });

  it("infers the nearby previous year for a December till date in January", () => {
    expect(
      parsePromotionDateRange("Grocery Selections (Till 31 December)", {
        referenceDate: new Date("2027-01-02T04:00:00.000Z"),
        defaultDurationDays: 7
      })
    ).toEqual({
      validFrom: new Date("2026-12-24T16:00:00.000Z"),
      validTo: new Date("2026-12-31T15:59:59.999Z")
    });
  });

  it("allows an inferred range to cross a month boundary", () => {
    expect(
      parsePromotionDateRange("Grocery Selections (Till 3 June 2026)", {
        defaultDurationDays: 7
      })
    ).toEqual({
      validFrom: new Date("2026-05-27T16:00:00.000Z"),
      validTo: new Date("2026-06-03T15:59:59.999Z")
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

  it("rejects impossible calendar dates", () => {
    expect(() => parsePromotionDateRange("31 Jun 2026 - 3 Jul 2026")).toThrow(
      "Invalid promotion date: 31 Jun 2026"
    );
    expect(() =>
      parsePromotionDateRange("Grocery Selections (Till 29 February 2026)")
    ).toThrow("Invalid promotion date: 29 February 2026");
  });

  it("rejects an inverted same-month range", () => {
    expect(() => parsePromotionDateRange("10 - 4 Jun 2026")).toThrow(
      "Promotion validity range ends before it starts"
    );
  });

  it.each([0, -1, 1.5])(
    "rejects invalid default duration %s",
    (defaultDurationDays) => {
      expect(() =>
        parsePromotionDateRange("Grocery Selections (Till 10 June 2026)", {
          defaultDurationDays
        })
      ).toThrow("defaultDurationDays must be a positive integer");
    }
  );

  it("rejects an inferred start outside the supported calendar range", () => {
    expect(() =>
      parsePromotionDateRange("Grocery Selections (Till 10 June 2026)", {
        defaultDurationDays: Number.MAX_SAFE_INTEGER
      })
    ).toThrow("Promotion validity range could not be inferred");
  });
});
