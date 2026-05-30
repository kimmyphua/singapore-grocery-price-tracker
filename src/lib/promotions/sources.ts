import * as cheerio from "cheerio";
import type { PromotionRetailerSlug, PromotionSource } from "./types";

type DiscoverOptions = {
  fetcher?: PromotionFetch;
  retailerSlug?: PromotionRetailerSlug;
};

type PromotionFetch = (url: string, init?: RequestInit) => Promise<Response>;

const FAIRPRICE_URL = "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/page/1";
const GIANT_URL = "https://giant.sg/super-savings";
const SHENG_SIONG_URL =
  "https://corporate.shengsiong.com.sg/category/promotions/newspaper-advertisement/";
const COLD_STORAGE_URL = "https://coldstorage.com.sg/weekly-ads/Grocery-Selections";

export async function discoverPromotionSources(
  options: DiscoverOptions = {}
): Promise<PromotionSource[]> {
  const fetcher: PromotionFetch = options.fetcher ?? fetch;
  const tasks: Record<PromotionRetailerSlug, () => Promise<PromotionSource[]>> = {
    fairprice: () => discoverFairPrice(fetcher),
    giant: () => discoverGiant(fetcher),
    "sheng-siong": () => discoverShengSiong(fetcher),
    "cold-storage": () => discoverColdStorage(fetcher)
  };

  if (options.retailerSlug) {
    return tasks[options.retailerSlug]();
  }

  const settled = await Promise.allSettled(Object.values(tasks).map((task) => task()));
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function discoverFairPrice(fetcher: PromotionFetch): Promise<PromotionSource[]> {
  const html = await fetchText(fetcher, FAIRPRICE_URL);
  const urls = unique(
    [
      ...html.matchAll(/https:\/\/view\.publitas\.com\/[^"'<>\\\s]+?at1600\.jpg/g)
    ].map((match) => decodeHtml(match[0]))
  );

  return urls.map((assetUrl, index) => ({
    retailerSlug: "fairprice",
    title: `FairPrice Weekly Savers page ${index + 1}`,
    sourceUrl: FAIRPRICE_URL,
    assetUrl,
    assetKind: "image"
  }));
}

async function discoverGiant(fetcher: PromotionFetch): Promise<PromotionSource[]> {
  const html = await fetchText(fetcher, GIANT_URL);
  const pdfUrl = findPdfUrl(html, GIANT_URL);
  return pdfUrl
    ? [
        {
          retailerSlug: "giant",
          title: "Giant Super Savings",
          sourceUrl: GIANT_URL,
          assetUrl: pdfUrl,
          assetKind: "pdf"
        }
      ]
    : [];
}

async function discoverShengSiong(fetcher: PromotionFetch): Promise<PromotionSource[]> {
  const listingHtml = await fetchText(fetcher, SHENG_SIONG_URL);
  const $ = cheerio.load(listingHtml);
  const postUrls = unique(
    $("a")
      .map((_, element) => $(element).attr("href"))
      .get()
      .filter((href): href is string => Boolean(href))
      .map((href) => new URL(href, SHENG_SIONG_URL).toString())
      .filter((href) => href.includes("shengsiong.com.sg/"))
      .filter((href) => /special|promotion|advertisement/i.test(href))
  ).slice(0, 3);

  const sources: PromotionSource[] = [];
  for (const postUrl of postUrls) {
    const postHtml = await fetchText(fetcher, postUrl);
    const pdfUrl = findPdfUrl(postHtml, postUrl);
    if (pdfUrl) {
      sources.push({
        retailerSlug: "sheng-siong",
        title: getHeading(postHtml) ?? "Sheng Siong Newspaper Advertisement",
        sourceUrl: postUrl,
        assetUrl: pdfUrl,
        assetKind: "pdf"
      });
    }
  }

  return sources;
}

async function discoverColdStorage(fetcher: PromotionFetch): Promise<PromotionSource[]> {
  const html = await fetchText(fetcher, COLD_STORAGE_URL);
  const pdfUrl = findPdfUrl(html, COLD_STORAGE_URL);
  return pdfUrl
    ? [
        {
          retailerSlug: "cold-storage",
          title: getHeading(html) ?? "Cold Storage Grocery Selections",
          sourceUrl: COLD_STORAGE_URL,
          assetUrl: pdfUrl,
          assetKind: "pdf"
        }
      ]
    : [];
}

async function fetchText(fetcher: PromotionFetch, url: string) {
  const response = await fetcher(url, {
    headers: { "user-agent": process.env.SCRAPER_USER_AGENT ?? "SG Grocery Tracker" }
  });
  if (!response.ok) {
    throw new Error(`Promotion source request failed: ${response.status} ${url}`);
  }
  return response.text();
}

function findPdfUrl(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const hrefs = $("a")
    .map((_, element) => $(element).attr("href"))
    .get();
  const htmlMatches = [...html.matchAll(/https?:\/\/[^"'<>\\\s]+?\.pdf/gi)].map((match) => match[0]);
  const candidates = [...hrefs, ...htmlMatches].filter((href): href is string =>
    Boolean(href && /\.pdf(?:$|\?)/i.test(href))
  );
  const first = candidates[0];
  return first ? new URL(decodeHtml(first), baseUrl).toString() : null;
}

function getHeading(html: string) {
  const $ = cheerio.load(html);
  return $("h1").first().text().trim() || null;
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&");
}

function unique(values: string[]) {
  return [...new Set(values)];
}
