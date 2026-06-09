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
      "https://corporate.shengsiong.com.sg/newspaper-advertisement-4-jun-2026-10-jun-2026/",
      await fixture("sheng-siong-post-weekend.html")
    ],
    [
      "https://corporate.shengsiong.com.sg/weekend-special-11-jun-2026-14-jun-2026/",
      await fixture("sheng-siong-post-future.html")
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
      fetcher: createFetcher(pages, requests),
      now: new Date("2026-06-08T04:00:00.000Z")
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
            "https://giant.sg/media/uploads/filemanager/4jun-supersavings.pdf",
          assetKind: "pdf",
          parserKind: "document",
          pageNumber: 1,
          validFrom,
          validTo
        }),
        expect.objectContaining({
          seriesKey: "sheng-siong-newspaper-advertisement",
          publicationKey:
            "sheng-siong-newspaper-advertisement:2026-06-03T16:00:00.000Z:newspaper-advertisement-4-jun-2026-10-jun-2026",
          retailerSlug: "sheng-siong",
          parserKind: "document",
          pageNumber: 1,
          validFrom,
          validTo
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
      retailerSlug: "giant",
      now: new Date("2026-06-08T04:00:00.000Z")
    });

    expect(result).toEqual({
      failures: [],
      sources: [
        expect.objectContaining({
          seriesKey: "giant-super-savings",
          title: "Giant Super Savings",
          assetUrl:
            "https://giant.sg/media/uploads/filemanager/4jun-supersavings.pdf",
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

  it("skips Giant when Super Savings ranges are only stale or upcoming", async () => {
    const pages = new Map([
      [
        "https://giant.sg/super-savings",
        [
          "<html><body>",
          '<a href="/media/uploads/filemanager/4jun-supersavings.pdf">DOWNLOAD PDF</a>',
          '<article data-slug="super-savings">',
          '<div data-start="2026-05-28" data-end="2026-06-03">',
          '<a href="/super-savings" title="Super Savings">Super Savings</a>',
          "</div>",
          "</article>",
          '<article data-slug="super-savings">',
          '<div data-start="2026-06-11" data-end="2026-06-17">',
          '<a href="/super-savings" title="Super Savings">Super Savings</a>',
          "</div>",
          "</article>",
          "</body></html>"
        ].join("")
      ]
    ]);

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "giant",
      now: new Date("2026-06-08T04:00:00.000Z")
    });

    expect(result).toEqual({ sources: [], failures: [] });
  });

  it("skips Giant when the page PDF has no verified Super Savings range", async () => {
    const pages = new Map([
      [
        "https://giant.sg/super-savings",
        [
          "<html><body>",
          '<a href="/media/uploads/filemanager/4jun-supersavings.pdf">DOWNLOAD PDF</a>',
          '<article data-slug="weekend-specials">',
          '<div data-start="2026-06-04" data-end="2026-06-10">',
          '<a href="/weekend-specials" title="Weekend Specials">Weekend Specials</a>',
          "</div>",
          "</article>",
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

  it("discovers the Cold Storage flyer image embedded in Next.js data", async () => {
    const pages = await promotionPages();
    pages.set(
      "https://coldstorage.com.sg/weekly-ads/Grocery-Selections-1",
      [
        "<html><body>",
        "<h1>Grocery Selections (Till 10 June)</h1>",
        '<script id="__NEXT_DATA__" type="application/json">',
        JSON.stringify({
          props: {
            pageProps: {
              ad: {
                image:
                  "https://csp.coldstorage.com.sg/media/weeklydeals/385/grocery-selections-20260604.jpg"
              }
            }
          }
        }),
        "</script>",
        "</body></html>"
      ].join("")
    );

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "cold-storage",
      now: new Date("2026-06-08T04:00:00.000Z")
    });

    expect(result.sources).toEqual([
      expect.objectContaining({
        assetKind: "image",
        assetUrl:
          "https://csp.coldstorage.com.sg/media/weeklydeals/385/grocery-selections-20260604.jpg"
      })
    ]);
  });

  it("skips upcoming FairPrice and Cold Storage publications", async () => {
    const pages = await promotionPages();

    const fairPrice = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "fairprice",
      now: new Date("2026-06-03T04:00:00.000Z")
    });
    const coldStorage = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "cold-storage",
      now: new Date("2026-06-03T04:00:00.000Z")
    });

    expect(fairPrice).toEqual({ sources: [], failures: [] });
    expect(coldStorage).toEqual({ sources: [], failures: [] });
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

  it("does not treat generic Sheng Siong promotions as newspaper flyers", async () => {
    const listingUrl =
      "https://corporate.shengsiong.com.sg/category/promotions/newspaper-advertisement/";
    const requests: string[] = [];
    const pages = new Map([
      [
        listingUrl,
        [
          "<html><body>",
          '<article><a href="/blk-336-smith-street-b1-300-01-304-7-days-special-05-june-2026-11-june-2026/">Store special</a></article>',
          '<article><a href="/mega-promotion-15-may-2026-11-june-2026/">Mega promotion</a></article>',
          "</body></html>"
        ].join("")
      ]
    ]);

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages, requests),
      retailerSlug: "sheng-siong",
      now: new Date("2026-06-08T04:00:00.000Z")
    });

    expect(result).toEqual({ sources: [], failures: [] });
    expect(requests).toEqual([listingUrl]);
  });

  it("ignores navigation and emits only the current Sheng Siong post", async () => {
    const pages = await promotionPages();
    const requests: string[] = [];

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages, requests),
      retailerSlug: "sheng-siong",
      now: new Date("2026-06-08T04:00:00.000Z")
    });

    expect(result.failures).toEqual([]);
    expect(result.sources).toEqual([
      expect.objectContaining({
        sourceUrl:
          "https://corporate.shengsiong.com.sg/newspaper-advertisement-4-jun-2026-10-jun-2026/"
      })
    ]);
    expect(requests).toEqual([
      "https://corporate.shengsiong.com.sg/category/promotions/newspaper-advertisement/",
      "https://corporate.shengsiong.com.sg/newspaper-advertisement-4-jun-2026-10-jun-2026/"
    ]);
  });

  it("treats stale and future Sheng Siong posts as a successful empty result", async () => {
    const pages = await promotionPages();
    pages.delete(
      "https://corporate.shengsiong.com.sg/newspaper-advertisement-4-jun-2026-10-jun-2026/"
    );
    pages.set(
      "https://corporate.shengsiong.com.sg/newspaper-advertisement-4-jun-2026-10-jun-2026/",
      "<html><body><p>No flyer asset.</p></body></html>"
    );

    const result = await discoverPromotionSources({
      fetcher: createFetcher(pages),
      retailerSlug: "sheng-siong",
      now: new Date("2026-06-08T04:00:00.000Z")
    });

    expect(result).toEqual({ sources: [], failures: [] });
  });
});
