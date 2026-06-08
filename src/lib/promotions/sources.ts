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
  now?: Date;
};

type PromotionFetch = (url: string, init?: RequestInit) => Promise<Response>;

type DiscoveryTask = {
  seriesKey: PromotionSeriesKey;
  retailerSlug: PromotionRetailerSlug;
  discover: (
    fetcher: PromotionFetch,
    now: Date
  ) => Promise<PromotionSource[]>;
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
  const now = options.now ?? new Date();
  const tasks = options.retailerSlug
    ? DISCOVERY_TASKS.filter(
        (task) => task.retailerSlug === options.retailerSlug
      )
    : DISCOVERY_TASKS;
  const attempts = await Promise.all(
    tasks.map(async ({ seriesKey, discover }) => {
      try {
        return {
          sources: await discover(fetcher, now),
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
  fetcher: PromotionFetch,
  now: Date
): Promise<PromotionSource[]> {
  const html = await fetchText(fetcher, GIANT_URL);
  const heading = getHeading(html);
  const pdfUrl = findGiantSuperSavingsPdf(html);
  const dates = findGiantActiveSuperSavingsRange(html, now);
  if (!pdfUrl || !dates) {
    return [];
  }

  return [
    {
      seriesKey: "giant-super-savings",
      publicationKey: `giant-super-savings:${dates.validFrom.toISOString()}`,
      retailerSlug: "giant",
      title: heading ?? "Giant Super Savings",
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
    [...$("article a").toArray(), ...$("a").toArray()]
      .map((element) => $(element).attr("href"))
      .filter(isShengSiongPostHref)
      .map((href) => new URL(href, SHENG_SIONG_URL).toString())
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
      publicationKey: `sheng-siong-newspaper-advertisement:${dates.validFrom.toISOString()}:${normalizedUrlSlug(postUrl)}`,
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

function isShengSiongPostHref(href: string | undefined): href is string {
  if (!href || href.startsWith("#")) {
    return false;
  }

  const url = new URL(href, SHENG_SIONG_URL);
  const path = url.pathname.toLowerCase();
  if (
    url.hostname !== "corporate.shengsiong.com.sg" ||
    /^\/(?:category|tag|author|page|promotions?)(?:\/|$)/.test(path)
  ) {
    return false;
  }

  return (
    /special|promotion|advertisement/.test(path) &&
    /\d{1,2}[-/](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/]\d{4}/.test(
      path
    )
  );
}

function normalizedUrlSlug(value: string) {
  const segment = new URL(value).pathname.split("/").filter(Boolean).at(-1);
  return decodeURIComponent(segment ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
  const images = $("img").toArray();
  const image =
    images.find((element) =>
      /grocery selections/i.test($(element).attr("alt") ?? "")
    ) ??
    images.find((element) =>
      $(element).closest(
        '.weekly-ad-detail, [class*="flyer"], [class*="weekly-ad"], figure'
      ).length > 0
    );
  const source = image ? getImageSource($(image).attr() ?? {}) : null;
  return source ? new URL(decodeHtml(source), baseUrl).toString() : null;
}

function getImageSource(attributes: Record<string, string>) {
  const srcset = attributes.srcset;
  if (srcset) {
    const candidates = srcset
      .split(",")
      .map((candidate) => candidate.trim().split(/\s+/))
      .filter(([url]) => Boolean(url))
      .map(([url, descriptor]) => ({
        url,
        width: descriptor?.endsWith("w")
          ? Number(descriptor.slice(0, -1))
          : 0
      }))
      .sort((left, right) => right.width - left.width);
    if (candidates[0]) {
      return candidates[0].url;
    }
  }

  return attributes.src ?? null;
}

function getHeading(html: string) {
  const $ = cheerio.load(html);
  return $("h1").first().text().trim() || null;
}

function findGiantSuperSavingsPdf(html: string) {
  const $ = cheerio.load(html);
  const href = $("a")
    .toArray()
    .map((anchor) => $(anchor).attr("href"))
    .find(
      (candidate) =>
        candidate &&
        /\.pdf(?:$|\?)/i.test(candidate) &&
        /super.?savings|\bgss\b/i.test(candidate)
    );
  return href ? new URL(decodeHtml(href), GIANT_URL).toString() : null;
}

function findGiantActiveSuperSavingsRange(html: string, now: Date) {
  const $ = cheerio.load(html);
  const candidates = $("[data-start][data-end]")
    .toArray()
    .flatMap((element) => {
      const datedCard = $(element);
      const isSuperSavingsSlug =
        datedCard.closest('[data-slug="super-savings"]').length > 0;
      const isSuperSavingsLink = datedCard
        .find("a")
        .toArray()
        .some((anchor) => {
          const href = $(anchor).attr("href") ?? "";
          const title = $(anchor).attr("title") ?? "";
          return (
            new URL(href, GIANT_URL).pathname.replace(/\/+$/, "") ===
              "/super-savings" || /^super savings$/i.test(title.trim())
          );
        });
      if (!isSuperSavingsSlug && !isSuperSavingsLink) {
        return [];
      }

      const startText = formatIsoDateForRange(
        datedCard.attr("data-start") ?? ""
      );
      const endText = formatIsoDateForRange(datedCard.attr("data-end") ?? "");
      const dates =
        startText && endText
          ? tryParsePromotionDateRange(`${startText} - ${endText}`)
          : null;
      return dates ? [dates] : [];
    })
    .filter(
      ({ validFrom, validTo }) =>
        validFrom.getTime() <= now.getTime() &&
        now.getTime() <= validTo.getTime()
    )
    .sort(
      (left, right) =>
        right.validFrom.getTime() - left.validFrom.getTime()
    );

  return candidates[0] ?? null;
}

function formatIsoDateForRange(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const monthNumber = Number(month);
  const monthName = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ][monthNumber - 1];
  return monthName ? `${Number(day)} ${monthName} ${year}` : null;
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
