import { describe, expect, it } from "vitest";
import { compareProductIdentity } from "@/lib/products/identity";

describe("compareProductIdentity", () => {
  const magnum = {
    brand: "Magnum",
    packCount: 6,
    totalSize: 330,
    unit: "ml"
  };

  it("accepts normalized text and a total-size difference within 0.5%", () => {
    expect(
      compareProductIdentity(magnum, {
        brand: "  magnum ",
        packCount: 6,
        totalSize: 331,
        unit: " ML "
      })
    ).toEqual({ compatible: true });
  });

  it.each([
    ["brand", { ...magnum, brand: "Bulla" }],
    ["packCount", { ...magnum, packCount: 3 }],
    ["unit", { ...magnum, unit: "g" }],
    ["totalSize", { ...magnum, totalSize: 340 }]
  ] as const)("rejects a conflicting %s", (field, candidate) => {
    expect(compareProductIdentity(magnum, candidate)).toEqual({
      compatible: false,
      conflicts: [
        {
          field,
          expected: magnum[field],
          actual: candidate[field]
        }
      ]
    });
  });

  it("returns every conflicting field for display", () => {
    expect(
      compareProductIdentity(magnum, {
        brand: "Bulla",
        packCount: 3,
        totalSize: 330,
        unit: "g"
      })
    ).toMatchObject({
      compatible: false,
      conflicts: [
        { field: "brand" },
        { field: "unit" },
        { field: "packCount" }
      ]
    });
  });
});
