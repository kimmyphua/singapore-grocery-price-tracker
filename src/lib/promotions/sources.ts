import * as cheerio from "cheerio";
import { parsePromotionDateRange } from "./dates";
import type {
  PromotionDiscoveryFailure,
  PromotionDiscoveryResult,
  PromotionRetailerSlug,
  PromotionSeriesKey,
  PromotionSource
} from "./types";

type DiscoverOptions = {
  fetcher?: PromotionFetch;
  retailerSlug?: PromotionRetailerSlug;
};

type PromotionFetch = (url: string, init?: RequestInit) => Promise<Response>;

type DiscoveryTask = {
  seriesKey: PromotionSeriesKey;
  retailerSlug: PromotionRetailerSlug;
  discover: (fetcher: PromotionFetch) => Promise<PromotionSource[]>;
};

type PublitasMetadata = {
  id: number;
  config: {
    publicationOriginalTitle: string;
  };
};

type PublitasSpread = {
  pages: Array<{
    number: number;
    images: {
      at1600: string;
    };
  }>;
};

const USER_AGENT = process.env.SCRAPER_USER_AGENT ?? "SG Grocery Tracker";
const GIANT_URL = "https://giant.sg/super-savings";
const SHENG_SIONG_URL =
  "https://corporate.shengsiong.com.sg/category/promotions/newspaper-advertisement/";
const COLD_STORAGE_LISTING_URL = "https://coldstorage.com.sg/weekly-ads";
const FAIRPRICE_SERIES = [
  {
    seriesKey: "fairprice-weekly-savers",
    url: "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers"
  },
  {
    seriesKey: "fairprice-must-buy",
    url: "https://promotions.fairprice.com.sg/price-drop-buy-now-must-buy"
  }
] as const;

const DISCOVERY_TASKS: DiscoveryTask[] = [
  ...FAIRPRICE_SERIES.map(({ seriesKey, url }) => ({
    seriesKey,
    retailerSlug: "fairprice" as const,
    discover: (fetcher: PromotionFetch) =>
      discoverFairPriceSeries(fetcher, seriesKey, url)
  })),
  {
    seriesKey: "giant-super-savings",
    retailerSlug: "giant",
    discover: discoverGiant
  },
  {
    seriesKey: "sheng-siong-newspaper-advertisement",
    retailerSlug: "sheng-siong",
    discover: discoverShengSiong
  },
  {
    seriesKey: "cold-storage-grocery-selections",
    retailerSlug: "cold-storage",
    discover: discoverColdStorage
  }
];

export async function discoverPromotionSources(
  options: DiscoverOptions = {}
): Promise<PromotionDiscoveryResult> {
  const fetcher = options.fetcher ?? fetch;
  const tasks = options.retailerSlug
    ? DISCOVERY_TASKS.filter(
        (task) => task.retailerSlug === options.retailerSlug
      )
    : DISCOVERY_TASKS;
  const attempts = await Promise.all(
    tasks.map(async ({ seriesKey, discover }) => {
      try {
        return {
          sources: await discover(fetcher),
          failures: [] as PromotionDiscoveryFailure[]
        };
      } catch (error) {
        return {
          sources: [],
          failures: [
            {
              seriesKey,
              message: error instanceof Error ? error.message : String(error)
            }
          ]
        };
      }
    })
  );

  return {
    sources: attempts.flatMap((attempt) => attempt.sources),
    failures: attempts.flatMap((attempt) => attempt.failures)
  };
}

async function discoverFairPriceSeries(
  fetcher: PromotionFetch,
  seriesKey: (typeof FAIRPRICE_SERIES)[number]["seriesKey"],
  url: string
): Promise<PromotionSource[]> {
  const [metadata, spreads] = await Promise.all([
    fetchJson<PublitasMetadata>(fetcher, `${url}/data.json`),
    fetchJson<PublitasSpread[]>(fetcher, `${url}/spreads.json`)
  ]);
  const dates = parsePromotionDateRange(
    metadata.config.publicationOriginalTitle
  );

  return spreads.flatMap((spread) =>
    spread.pages.map((page) => ({
      seriesKey,
      publicationKey: `${seriesKey}:${metadata.id}`,
      retailerSlug: "fairprice",
      title: metadata.config.publicationOriginalTitle,
      sourceUrl: `${url}/page/${page.number}`,
      assetUrl: new URL(
        page.images.at1600,
        "https://view.publitas.com"
      ).toString(),
      assetKind: "image",
      parserKind: "fairprice-grid",
      pageNumber: page.number,
      ...dates
    }))
  );
}

async function discoverGiant(
  fetcher: PromotionFetch
): Promise<PromotionSource[]> {
  const html = await fetchText(fetcher, GIANT_URL);
  const pdfUrl = findPdfUrl(html, GIANT_URL);
  const title = getHeading(html);
  const dates = title ? tryParsePromotionDateRange(title) : null;
  if (!pdfUrl || !title || !dates) {
    return [];
  }

  return [
    {
      seriesKey: "giant-super-savings",
      publicationKey: `giant-super-savings:${dates.validFrom.toISOString()}`,
      retailerSlug: "giant",
      title,
      sourceUrl: GIANT_URL,
      assetUrl: pdfUrl,
      assetKind: "pdf",
      parserKind: "document",
      pageNumber: 1,
      ...dates
    }
  ];
}

async function discoverShengSiong(
  fetcher: PromotionFetch
): Promise<PromotionSource[]> {
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
    const title = getHeading(postHtml);
    const dates = title
      ? tryParsePromotionDateRange(`${title} ${postUrl}`)
      : tryParsePromotionDateRange(postUrl);
    if (!pdfUrl || !title || !dates) {
      continue;
    }

    sources.push({
      seriesKey: "sheng-siong-newspaper-advertisement",
      publicationKey: `sheng-siong-newspaper-advertisement:${dates.validFrom.toISOString()}`,
      retailerSlug: "sheng-siong",
      title,
      sourceUrl: postUrl,
      assetUrl: pdfUrl,
      assetKind: "pdf",
      parserKind: "document",
      pageNumber: 1,
      ...dates
    });
  }

  return sources;
}

async function discoverColdStorage(
  fetcher: PromotionFetch
): Promise<PromotionSource[]> {
  const listingHtml = await fetchText(fetcher, COLD_STORAGE_LISTING_URL);
  const detailUrl = findLink(
    listingHtml,
    COLD_STORAGE_LISTING_URL,
    /grocery selections/i
  );
  if (!detailUrl) {
    return [];
  }

  const detailHtml = await fetchText(fetcher, detailUrl);
  const title = getHeading(detailHtml);
  if (!title) {
    return [];
  }

  const dates = parsePromotionDateRange(title, { defaultDurationDays: 7 });
  const assetUrl =
    findPdfUrl(detailHtml, detailUrl) ??
    findPrimaryImageUrl(detailHtml, detailUrl);
  if (!assetUrl) {
    return [];
  }

  return [
    {
      seriesKey: "cold-storage-grocery-selections",
      publicationKey: `cold-storage-grocery-selections:${dates.validFrom.toISOString()}`,
      retailerSlug: "cold-storage",
      title,
      sourceUrl: detailUrl,
      assetUrl,
      assetKind: /\.pdf(?:$|\?)/i.test(assetUrl) ? "pdf" : "image",
      parserKind: "document",
      pageNumber: 1,
      ...dates
    }
  ];
}

async function fetchText(fetcher: PromotionFetch, url: string) {
  const response = await request(fetcher, url);
  return response.text();
}

async function fetchJson<T>(fetcher: PromotionFetch, url: string): Promise<T> {
  const response = await request(fetcher, url);
  return response.json() as Promise<T>;
}

async function request(fetcher: PromotionFetch, url: string) {
  const response = await fetcher(url, {
    headers: { "user-agent": USER_AGENT }
  });
  if (!response.ok) {
    throw new Error(
      `Promotion source request failed: ${response.status} ${url}`
    );
  }
  return response;
}

function findLink(html: string, baseUrl: string, pattern: RegExp) {
  const $ = cheerio.load(html);
  const link = $("a")
    .toArray()
    .find((element) => {
      const href = $(element).attr("href") ?? "";
      return pattern.test(`${$(element).text()} ${href}`);
    });
  const href = link ? $(link).attr("href") : null;
  return href ? new URL(decodeHtml(href), baseUrl).toString() : null;
}

function findPdfUrl(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const hrefs = $("a")
    .map((_, element) => $(element).attr("href"))
    .get();
  const htmlMatches = [...html.matchAll(/https?:\/\/[^"'<>\\\s]+?\.pdf/gi)].map(
    (match) => match[0]
  );
  const candidates = [...hrefs, ...htmlMatches].filter((href): href is string =>
    Boolean(href && /\.pdf(?:$|\?)/i.test(href))
  );
  const first = candidates[0];
  return first ? new URL(decodeHtml(first), baseUrl).toString() : null;
}

function findPrimaryImageUrl(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const source = $("img").first().attr("src");
  return source ? new URL(decodeHtml(source), baseUrl).toString() : null;
}

function getHeading(html: string) {
  const $ = cheerio.load(html);
  return $("h1").first().text().trim() || null;
}

function tryParsePromotionDateRange(text: string) {
  try {
    return parsePromotionDateRange(text);
  } catch {
    return null;
  }
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&");
}

function unique(values: string[]) {
  return [...new Set(values)];
}
