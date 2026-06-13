import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { z } from "zod";
import type { DiscoveredFlyerEdition } from "./types";

const COLD_STORAGE_URL =
  "https://coldstorage.com.sg/weekly-ads/Grocery-Selections";
const FAIRPRICE_URL =
  "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/page/1";

const publitasMetadataSchema = z.object({
  id: z.number().int().positive(),
  config: z.object({
    publicationOriginalTitle: z.string().trim().min(1)
  })
});

const publitasSpreadsSchema = z.array(
  z.object({
    pages: z.array(
      z.object({
        number: z.number().int().positive()
      })
    )
  })
);

export function discoverColdStorageEdition(
  html: string,
  options: { referenceDate?: Date } = {}
): DiscoveredFlyerEdition {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim();
  const href = $("a")
    .toArray()
    .map((element) => $(element).attr("href"))
    .find((value): value is string => Boolean(value && /\.pdf(?:$|\?)/i.test(value)));

  if (!title || !href) {
    throw new Error("Cold Storage flyer title or PDF was not found.");
  }

  const directPdfUrl = new URL(href, COLD_STORAGE_URL);
  if (
    directPdfUrl.hostname !== "csp.coldstorage.com.sg" ||
    !directPdfUrl.pathname.startsWith("/media/weeklydeals/") ||
    !directPdfUrl.pathname.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("Cold Storage flyer PDF URL is not supported.");
  }
  directPdfUrl.protocol = "https:";

  const dates = parseDateRange(title, options.referenceDate);
  return {
    sourceKey: "cold-storage-grocery-selections",
    title,
    sourceUrl: COLD_STORAGE_URL,
    directPdfUrl: directPdfUrl.toString(),
    publicationUrl: null,
    assetKind: "PDF",
    ...dates,
    metadataFingerprint: fingerprint([
      title,
      directPdfUrl.toString(),
      dates.validFrom?.toISOString() ?? "",
      dates.validTo?.toISOString() ?? ""
    ])
  };
}

export function discoverFairPriceEdition(
  metadataInput: unknown,
  spreadsInput: unknown
): DiscoveredFlyerEdition {
  const metadata = publitasMetadataSchema.safeParse(metadataInput);
  const spreads = publitasSpreadsSchema.safeParse(spreadsInput);
  const pages = spreads.success
    ? spreads.data.flatMap((spread) => spread.pages)
    : [];

  if (!metadata.success || pages.length === 0) {
    throw new Error("FairPrice publication metadata is invalid.");
  }

  const title = metadata.data.config.publicationOriginalTitle;
  const dates = parseDateRange(title);
  return {
    sourceKey: "fairprice-weekly-savers",
    title,
    sourceUrl: FAIRPRICE_URL,
    directPdfUrl: null,
    publicationUrl: FAIRPRICE_URL,
    assetKind: "PUBLICATION",
    ...dates,
    metadataFingerprint: fingerprint([
      String(metadata.data.id),
      title,
      pages.map((page) => page.number).sort((a, b) => a - b).join(",")
    ])
  };
}

function parseDateRange(text: string, referenceDate = new Date()) {
  const range = text.match(
    /(\d{1,2})\s+([A-Za-z]{3,9})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/i
  );
  if (range) {
    const year = range[5]
      ? Number(range[5])
      : inferNearestYear(range[4], Number(range[3]), referenceDate);
    return singaporeRange(
      year,
      monthIndex(range[2]),
      Number(range[1]),
      year,
      monthIndex(range[4]),
      Number(range[3])
    );
  }

  const till = text.match(
    /till\s+(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/i
  );
  if (!till) {
    return { validFrom: null, validTo: null };
  }

  const year = till[3]
    ? Number(till[3])
    : inferNearestYear(till[2], Number(till[1]), referenceDate);
  const end = new Date(Date.UTC(year, monthIndex(till[2]), Number(till[1])));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return singaporeRange(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate()
  );
}

function singaporeRange(
  startYear: number,
  startMonth: number,
  startDay: number,
  endYear: number,
  endMonth: number,
  endDay: number
) {
  return {
    validFrom: new Date(
      Date.UTC(startYear, startMonth, startDay - 1, 16, 0, 0, 0)
    ),
    validTo: new Date(
      Date.UTC(endYear, endMonth, endDay, 15, 59, 59, 999)
    )
  };
}

function inferNearestYear(monthName: string, day: number, referenceDate: Date) {
  const month = monthIndex(monthName);
  const referenceYear = Number(
    new Intl.DateTimeFormat("en-SG", {
      timeZone: "Asia/Singapore",
      year: "numeric"
    }).format(referenceDate)
  );
  return [referenceYear - 1, referenceYear, referenceYear + 1]
    .map((year) => ({
      year,
      distance: Math.abs(
        Date.UTC(year, month, day) - referenceDate.getTime()
      )
    }))
    .sort((left, right) => left.distance - right.distance)[0].year;
}

function monthIndex(value: string) {
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec"
  ];
  const month = months.indexOf(value.slice(0, 3).toLowerCase());
  if (month < 0) {
    throw new Error(`Unsupported flyer month: ${value}`);
  }
  return month;
}

function fingerprint(parts: string[]) {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}
