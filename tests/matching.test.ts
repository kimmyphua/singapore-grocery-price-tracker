import { describe, expect, it } from "vitest";
import { classifyProductMatch } from "@/lib/matching/match-products";

describe("product matching", () => {
  const canonical = {
    brand: "Kinder Bueno",
    family: "Chocolate",
    flavour: "Milk Chocolate",
    packCount: 3,
    totalSize: 129,
    unit: "g"
  };

  it("accepts exact normalized product matches", () => {
    expect(classifyProductMatch(canonical, canonical)).toEqual({
      status: "AUTO_MATCH",
      confidence: 1,
      reasons: ["brand", "family", "flavour", "pack", "size"]
    });
  });

  it("flags likely matches for manual review instead of auto-merging", () => {
    expect(
      classifyProductMatch(canonical, {
        ...canonical,
        flavour: "Original"
      })
    ).toMatchObject({
      status: "REVIEW",
      confidence: 0.8
    });
  });

  it("rejects low-confidence matches", () => {
    expect(
      classifyProductMatch(canonical, {
        brand: "Lakerol",
        family: "Pastilles",
        flavour: "Original",
        packCount: 1,
        totalSize: 25,
        unit: "g"
      })
    ).toMatchObject({
      status: "NO_MATCH"
    });
  });
});
