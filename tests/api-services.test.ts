import { describe, expect, it } from "vitest";
import {
  createScrapeRunPayload,
  listLatestPricesPayload,
  listProductsPayload
} from "@/lib/api/payloads";

describe("api payload helpers", () => {
  it("lists products from the database client when available", async () => {
    const payload = await listProductsPayload({
      canonicalProduct: {
        findMany: async () => [{ slug: "kitkat", brand: "KitKat" }]
      }
    });

    expect(payload).toEqual({
      products: [{ slug: "kitkat", brand: "KitKat" }]
    });
  });

  it("returns an empty price list when the database is unavailable", async () => {
    const payload = await listLatestPricesPayload({
      priceSnapshot: {
        findMany: async () => {
          throw new Error("database unavailable");
        }
      }
    });

    expect(payload).toEqual({
      prices: [],
      source: "db-unavailable"
    });
  });

  it("creates a scrape run payload through the database client", async () => {
    const payload = await createScrapeRunPayload(
      {
        scrapeRun: {
          create: async ({ data }) => ({
            id: "run_1",
            ...data
          })
        }
      },
      { retailerSlug: "fairprice", query: "Magnum Mini Almond" }
    );

    expect(payload.scrapeRun).toMatchObject({
      id: "run_1",
      query: "Magnum Mini Almond",
      status: "STARTED"
    });
  });
});
