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
    discover: (fetcher: PromotionFetch, now: Date) =>
      discoverFairPriceSeries(fetcher, seriesKey, url, now)
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
  url: string,
  now: Date
): Promise<PromotionSource[]> {
  const [metadata, spreads] = await Promise.all([
    fetchJson<PublitasMetadata>(fetcher, `${url}/data.json`),
    fetchJson<PublitasSpread[]>(fetcher, `${url}/spreads.json`)
  ]);
  const dates = parsePromotionDateRange(
    metadata.config.publicationOriginalTitle
  );
  if (!isDateActive(dates, now)) {
    return [];
  }

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
  const dates = findGiantActiveSuperSavingsRange(html, now);
  const pdfUrl = dates
    ? findGiantSuperSavingsPdf(html, dates.validFrom)
    : null;
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
  fetcher: PromotionFetch,
  now: Date
): Promise<PromotionSource[]> {
  const listingHtml = await fetchText(fetcher, SHENG_SIONG_URL);
  const $ = cheerio.load(listingHtml);
  const postCandidates = unique(
    [...$("article a").toArray(), ...$("a").toArray()]
      .map((element) => $(element).attr("href"))
      .filter(isShengSiongPostHref)
      .map((href) => new URL(href, SHENG_SIONG_URL).toString())
  )
    .slice(0, 10)
    .flatMap((postUrl) => {
      const dates = parseShengSiongPostUrlDates(postUrl);
      return dates && isDateActive(dates, now) ? [{ postUrl, dates }] : [];
    })
    .slice(0, 3);

  const sources: PromotionSource[] = [];
  for (const { postUrl, dates: candidateDates } of postCandidates) {
    const postHtml = await fetchText(fetcher, postUrl);
    const pdfUrl = findPdfUrl(postHtml, postUrl);
    const title = getHeading(postHtml);
    const dates = title
      ? tryParsePromotionDateRange(`${title} ${postUrl}`)
      : candidateDates;
    if (!pdfUrl || !title || !dates || !isDateActive(dates, now)) {
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

function parseShengSiongPostUrlDates(value: string) {
  const path = decodeURIComponent(new URL(value).pathname);
  const match = path.match(
    /(\d{1,2})-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*-(\d{4}).*?(\d{1,2})-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*-(\d{4})/i
  );
  return match
    ? tryParsePromotionDateRange(
        `${match[1]} ${match[2]} ${match[3]} - ${match[4]} ${match[5]} ${match[6]}`
      )
    : null;
}

function isDateActive(
  dates: { validFrom: Date; validTo: Date },
  now: Date
) {
  return (
    dates.validFrom.getTime() <= now.getTime() &&
    now.getTime() <= dates.validTo.getTime()
  );
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
    /newspaper-advertisement/.test(path) &&
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
  fetcher: PromotionFetch,
  now: Date
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
  if (!isDateActive(dates, now)) {
    return [];
  }
  const assetUrl =
    findPdfUrl(detailHtml, detailUrl) ??
    findPrimaryImageUrl(detailHtml, detailUrl) ??
    findColdStoragePayloadImageUrl(detailHtml);
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

function findColdStoragePayloadImageUrl(html: string) {
  const $ = cheerio.load(html);
  for (const script of $('script[type="application/json"]').toArray()) {
    try {
      const image = findColdStorageWeeklyAdImage(
        JSON.parse($(script).text()) as unknown
      );
      if (image) {
        return image;
      }
    } catch {
      continue;
    }
  }

  const rscMatch = html.match(
    /\\"image\\":\\"(https:\/\/csp\.coldstorage\.com\.sg\/media\/weeklydeals\/[^"\\]+?\.(?:jpe?g|png|webp))\\"/i
  );
  return rscMatch?.[1] ?? null;
}

function findColdStorageWeeklyAdImage(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = findColdStorageWeeklyAdImage(item);
      if (image) {
        return image;
      }
    }
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.image === "string" &&
    isColdStorageWeeklyAdImage(record.image)
  ) {
    return record.image;
  }
  for (const child of Object.values(record)) {
    const image = findColdStorageWeeklyAdImage(child);
    if (image) {
      return image;
    }
  }
  return null;
}

function isColdStorageWeeklyAdImage(value: string) {
  try {
    const url = new URL(value);
    return (
      url.hostname === "csp.coldstorage.com.sg" &&
      url.pathname.includes("/media/weeklydeals/") &&
      /\.(?:jpe?g|png|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
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

function findGiantSuperSavingsPdf(html: string, validFrom: Date) {
  const $ = cheerio.load(html);
  const candidates = unique(
    $("a")
      .toArray()
      .map((anchor) => $(anchor).attr("href"))
      .filter(
        (candidate): candidate is string =>
          typeof candidate === "string" &&
          /\.pdf(?:$|\?)/i.test(candidate) &&
          /super.?savings|\bgss\b/i.test(candidate)
      )
      .map((href) => new URL(decodeHtml(href), GIANT_URL).toString())
  );
  const start = singaporeMonthDay(validFrom);
  const matching = candidates.filter((candidate) => {
    const filenameDate = parseFilenameMonthDay(candidate);
    return (
      filenameDate?.day === start.day &&
      filenameDate.month === start.month
    );
  });

  if (candidates.length === 1) {
    const filenameDate = parseFilenameMonthDay(candidates[0]);
    return !filenameDate || matching.length === 1 ? candidates[0] : null;
  }

  return matching.length === 1 ? matching[0] : null;
}

function parseFilenameMonthDay(value: string) {
  const filename = new URL(value).pathname.split("/").at(-1) ?? "";
  const match = filename.match(
    /(?:^|[^0-9])(\d{1,2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
  );
  if (!match) {
    return null;
  }

  return {
    day: Number(match[1]),
    month: match[2].slice(0, 3).toLowerCase()
  };
}

function singaporeMonthDay(value: Date) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    month: "short",
    day: "numeric"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: Number(values.day),
    month: values.month.slice(0, 3).toLowerCase()
  };
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
