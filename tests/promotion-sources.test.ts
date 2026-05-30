import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverPromotionSources } from "@/lib/promotions/sources";

const fixtureRoot = path.join(process.cwd(), "tests/fixtures/promotions");

async function fixture(name: string) {
  return readFile(path.join(fixtureRoot, name), "utf8");
}

describe("promotion source discovery", () => {
  it("discovers current flyer assets for each supported retailer", async () => {
    const pages = new Map<string, string>([
      ["https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/page/1", await fixture("fairprice-weekly-savers.html")],
      ["https://giant.sg/super-savings", await fixture("giant-super-savings.html")],
      ["https://corporate.shengsiong.com.sg/category/promotions/newspaper-advertisement/", await fixture("sheng-siong-listing.html")],
      ["https://corporate.shengsiong.com.sg/4-days-special-28-may-2026-31-may-2026/", await fixture("sheng-siong-post.html")],
      ["https://coldstorage.com.sg/weekly-ads/Grocery-Selections", await fixture("cold-storage-weekly.html")]
    ]);
    const fetcher = async (url: string | URL) => {
      const body = pages.get(String(url));
      if (!body) {
        throw new Error(`Unexpected URL ${String(url)}`);
      }
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    };

    const sources = await discoverPromotionSources({ fetcher });

    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ retailerSlug: "fairprice", assetKind: "image", assetUrl: "https://view.publitas.com/91990/1790843/pages/f550e9f6-eb67-48fb-b29c-691343bbe981-at1600.jpg" }),
        expect.objectContaining({ retailerSlug: "giant", assetKind: "pdf", assetUrl: "https://giant.sg/media/uploads/filemanager/28may-gss.pdf" }),
        expect.objectContaining({ retailerSlug: "sheng-siong", assetKind: "pdf", assetUrl: "https://shengsiongcontent.s3.ap-southeast-1.amazonaws.com/wp-content/uploads/2026/05/26135433/SSAD26-1162-4-DAYS-28-310526-ST_ET.pdf" }),
        expect.objectContaining({ retailerSlug: "cold-storage", assetKind: "pdf", assetUrl: "http://csp.coldstorage.com.sg/media/weeklydeals/371/wk22_28_may_grocery_a3_fa-v1-20260527123710.pdf" })
      ])
    );
  });
});
