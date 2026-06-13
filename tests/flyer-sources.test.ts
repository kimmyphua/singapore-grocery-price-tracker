import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverColdStorageEdition,
  discoverFairPriceEdition
} from "@/lib/flyers/sources";

const fixtures = path.join(process.cwd(), "tests/fixtures/promotions");

function fixture(name: string) {
  return readFileSync(path.join(fixtures, name), "utf8");
}

describe("flyer source discovery", () => {
  it("discovers the current Cold Storage grocery PDF", () => {
    expect(
      discoverColdStorageEdition(fixture("cold-storage-weekly.html"), {
        referenceDate: new Date("2026-06-01T00:00:00.000Z")
      })
    ).toMatchObject({
      sourceKey: "cold-storage-grocery-selections",
      assetKind: "PDF",
      directPdfUrl: expect.stringMatching(/\.pdf$/),
      title: expect.stringContaining("Grocery Selections"),
      validFrom: new Date("2026-05-27T16:00:00.000Z"),
      validTo: new Date("2026-06-03T15:59:59.999Z")
    });
  });

  it("discovers the current FairPrice Publitas publication", () => {
    const metadata = JSON.parse(
      fixture("fairprice-weekly-savers-data.json")
    ) as unknown;
    const spreads = JSON.parse(
      fixture("fairprice-weekly-savers-spreads.json")
    ) as unknown;

    expect(discoverFairPriceEdition(metadata, spreads)).toMatchObject({
      sourceKey: "fairprice-weekly-savers",
      assetKind: "PUBLICATION",
      directPdfUrl: null,
      publicationUrl: expect.stringContaining(
        "promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/page/1"
      ),
      validFrom: new Date("2026-06-03T16:00:00.000Z"),
      validTo: new Date("2026-06-10T15:59:59.999Z")
    });
  });

  it("rejects malformed source payloads", () => {
    expect(() => discoverColdStorageEdition("<html></html>")).toThrow(
      "Cold Storage flyer"
    );
    expect(() => discoverFairPriceEdition({}, [])).toThrow(
      "FairPrice publication"
    );
  });
});
