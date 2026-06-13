import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

describe("flyer schema", () => {
  it("stores shared flyer sources and editions", () => {
    expect(schema).toContain("model FlyerSource");
    expect(schema).toContain("model FlyerEdition");
    expect(schema).toContain("enum FlyerSourceKind");
    expect(schema).toContain("enum FlyerAssetKind");
    expect(schema).not.toContain("model PromotionDeal");
    expect(schema).not.toContain("model PromotionFlyer");
  });
});
