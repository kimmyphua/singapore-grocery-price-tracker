import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverPromotionSources } from "@/lib/promotions/sources";

const fixtureRoot = path.join(process.cwd(), "tests/fixtures/promotions");
const validFrom = new Date("2026-06-03T16:00:00.000Z");
const validTo = new Date("2026-06-10T15:59:59.999Z");

async function fixture(name: string) {
  return readFile(path.join(fixtureRoot, name), "utf8");
}

async function promotionPages() {
  return new Map<string, string>([
    [
      "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/data.json",
      await fixture("fairprice-weekly-savers-data.json")
    ],
    [
      "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/spreads.json",
      await fixture("fairprice-weekly-savers-spreads.json")
    ],
    [
      "https://promotions.fairprice.com.sg/price-drop-buy-now-must-buy/data.json",
      await fixture("fairprice-must-buy-data.json")
    ],
    [
      "https://promotions.fairprice.com.sg/price-drop-buy-now-must-buy/spreads.json",
      await fixture("fairprice-must-buy-spreads.json")
    ],
    ["https://giant.sg/super-savings", await fixture("giant-super-savings.html")],
    [
      "https://corporate.shengsiong.com.sg/category/promotions/newspaper-advertisement/",
      await fixture("sheng-siong-listing.html")
    ],
    [
      "https://corporate.shengsiong.com.sg/4-days-special-28-may-2026-31-may-2026/",
      await fixture("sheng-siong-post.html")
    ],
    [
      "https://coldstorage.com.sg/weekly-ads",
      await fixture("cold-storage-listing.html")
    ],
    [
      "https://coldstorage.com.sg/weekly-ads/Grocery-Selections-1",
      await fixture("cold-storage-grocery-selections.html")
    ]
  ]);
}

function createFetcher(
  pages: Map<string, string>,
  requests: string[] = []
) {
  return async (url: string | URL) => {
    const requestedUrl = String(url);
    requests.push(requestedUrl);
    const body = pages.get(requestedUrl);
    if (body === undefined) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(body, { status: 200 });
  };
}

describe("promotion source discovery", () => {
  it("discovers dated current publications for every supported retailer", async () => {
    const pages = await promotionPages();
    const requests: string[] = [];

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages, requests)
    });

    expect(result.failures).toEqual([]);
    expect(
      result.sources.filter(
        (source) => source.seriesKey === "fairprice-weekly-savers"
      )
    ).toHaveLength(2);
    expect(
      result.sources.filter((source) => source.seriesKey === "fairprice-must-buy")
    ).toHaveLength(2);
    expect(requests).toContain(
      "https://coldstorage.com.sg/weekly-ads/Grocery-Selections-1"
    );

    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          seriesKey: "fairprice-weekly-savers",
          publicationKey: "fairprice-weekly-savers:1773986",
          retailerSlug: "fairprice",
          sourceUrl:
            "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/page/1",
          assetUrl:
            "https://view.publitas.com/91990/1773986/pages/weekly-savers-page-1-at1600.jpg",
          assetKind: "image",
          parserKind: "fairprice-grid",
          pageNumber: 1,
          validFrom,
          validTo
        }),
        expect.objectContaining({
          seriesKey: "fairprice-weekly-savers",
          pageNumber: 2
        }),
        expect.objectContaining({
          seriesKey: "fairprice-must-buy",
          publicationKey: "fairprice-must-buy:1773987",
          retailerSlug: "fairprice",
          sourceUrl:
            "https://promotions.fairprice.com.sg/price-drop-buy-now-must-buy/page/1",
          assetUrl:
            "https://view.publitas.com/91990/1773987/pages/must-buy-page-1-at1600.jpg",
          assetKind: "image",
          parserKind: "fairprice-grid",
          pageNumber: 1,
          validFrom,
          validTo
        }),
        expect.objectContaining({
          seriesKey: "fairprice-must-buy",
          pageNumber: 2
        }),
        expect.objectContaining({
          seriesKey: "giant-super-savings",
          publicationKey:
            "giant-super-savings:2026-06-03T16:00:00.000Z",
          retailerSlug: "giant",
          assetUrl:
            "https://giant.sg/media/uploads/filemanager/4jun-10jun-gss.pdf",
          assetKind: "pdf",
          parserKind: "document",
          pageNumber: 1,
          validFrom,
          validTo
        }),
        expect.objectContaining({
          seriesKey: "sheng-siong-newspaper-advertisement",
          publicationKey:
            "sheng-siong-newspaper-advertisement:2026-05-27T16:00:00.000Z",
          retailerSlug: "sheng-siong",
          parserKind: "document",
          pageNumber: 1,
          validFrom: new Date("2026-05-27T16:00:00.000Z"),
          validTo: new Date("2026-05-31T15:59:59.999Z")
        }),
        expect.objectContaining({
          seriesKey: "cold-storage-grocery-selections",
          publicationKey:
            "cold-storage-grocery-selections:2026-06-03T16:00:00.000Z",
          retailerSlug: "cold-storage",
          title: "Grocery Selections (Till 10 June)",
          sourceUrl:
            "https://coldstorage.com.sg/weekly-ads/Grocery-Selections-1",
          assetUrl:
            "https://csp.coldstorage.com.sg/media/weeklydeals/current.pdf",
          assetKind: "pdf",
          parserKind: "document",
          pageNumber: 1,
          validFrom,
          validTo
        })
      ])
    );
  });

  it("reports one FairPrice series failure without suppressing the other", async () => {
    const pages = await promotionPages();
    pages.delete(
      "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/data.json"
    );

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "fairprice"
    });

    expect(result.failures).toEqual([
      {
        seriesKey: "fairprice-weekly-savers",
        message:
          "Promotion source request failed: 404 https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/data.json"
      }
    ]);
    expect(
      result.sources.filter((source) => source.seriesKey === "fairprice-must-buy")
    ).toHaveLength(2);
    expect(
      result.sources.some(
        (source) => source.seriesKey === "fairprice-weekly-savers"
      )
    ).toBe(false);
  });

  it("uses Giant data attributes and a stable title when no heading exists", async () => {
    const pages = new Map([
      [
        "https://giant.sg/super-savings",
        await fixture("giant-super-savings.html")
      ]
    ]);

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "giant"
    });

    expect(result).toEqual({
      failures: [],
      sources: [
        expect.objectContaining({
          seriesKey: "giant-super-savings",
          title: "Giant Super Savings",
          validFrom,
          validTo
        })
      ]
    });
  });

  it("skips Giant when neither the heading nor attributes verify dates", async () => {
    const pages = new Map([
      [
        "https://giant.sg/super-savings",
        [
          "<html><body>",
          "<h1>Super Savings</h1>",
          '<a href="/media/uploads/filemanager/current.pdf">DOWNLOAD PDF</a>',
          "</body></html>"
        ].join("")
      ]
    ]);

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "giant"
    });

    expect(result).toEqual({ sources: [], failures: [] });
  });

  it("skips Giant when verified dates exist without a flyer asset", async () => {
    const pages = new Map([
      [
        "https://giant.sg/super-savings",
        '<html><body><section data-start="2026-06-04" data-end="2026-06-10"></section></body></html>'
      ]
    ]);

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "giant"
    });

    expect(result).toEqual({ sources: [], failures: [] });
  });

  it("selects the Grocery Selections flyer image instead of the site logo", async () => {
    const pages = await promotionPages();
    const detailUrl =
      "https://coldstorage.com.sg/weekly-ads/Grocery-Selections-1";
    pages.set(
      detailUrl,
      (pages.get(detailUrl) ?? "").replace(
        '<a href="https://csp.coldstorage.com.sg/media/weeklydeals/current.pdf">Shop Now</a>',
        ""
      )
    );

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "cold-storage"
    });

    expect(result).toEqual({
      failures: [],
      sources: [
        expect.objectContaining({
          seriesKey: "cold-storage-grocery-selections",
          assetKind: "image",
          assetUrl:
            "https://coldstorage.com.sg/media/weeklydeals/current-primary.jpg"
        })
      ]
    });
  });

  it("treats a fetched Sheng Siong listing with no dated flyer as empty", async () => {
    const pages = new Map([
      [
        "https://corporate.shengsiong.com.sg/category/promotions/newspaper-advertisement/",
        "<html><body><p>No current newspaper advertisement.</p></body></html>"
      ]
    ]);

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "sheng-siong"
    });

    expect(result).toEqual({ sources: [], failures: [] });
  });
});
