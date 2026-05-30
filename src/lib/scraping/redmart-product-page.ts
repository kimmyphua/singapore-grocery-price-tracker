import * as cheerio from "cheerio";
import type { ParsedRetailerProduct } from "./product-page-types";

type LazadaTrackingData = {
  brand_name?: string;
  pdt_name?: string;
  pdt_price?: string;
  pdt_sku?: string | number;
  pdt_simplesku?: string | number;
  core?: {
    currencyCode?: string;
  };
};

export function parseRedMartProductPage(
  html: string,
  productUrl: string
): ParsedRetailerProduct {
  const $ = cheerio.load(html);
  const trackingData = extractTrackingData(html);
  const title =
    trackingData?.pdt_name ??
    $("meta[property='og:title']").attr("content")?.replace(/\s*\|\s*Lazada Singapore$/, "");

  if (!title) {
    throw new Error("RedMart/Lazada product data was not found");
  }

  return {
    retailerSlug: "redmart",
    titleRaw: title,
    price: chooseBestVisiblePrice(trackingData?.pdt_price, getQueryParam(productUrl, "price")),
    productUrl,
    imageUrl: $("meta[property='og:image']").attr("content"),
    isAvailable: getQueryParam(productUrl, "stock") !== "0",
    retailerSku: String(trackingData?.pdt_simplesku ?? trackingData?.pdt_sku ?? ""),
    brandRaw: trackingData?.brand_name,
    currency: trackingData?.core?.currencyCode ?? "SGD",
    promotionText: extractRedMartPromotionText(html)
  };
}

function chooseBestVisiblePrice(
  trackingPrice: string | null | undefined,
  queryPrice: string | null
): number | null {
  const prices = [parsePrice(trackingPrice), parsePrice(queryPrice)].filter(
    (price): price is number => price !== null
  );

  return prices.length > 0 ? Math.min(...prices) : null;
}

function extractTrackingData(html: string): LazadaTrackingData | null {
  const match = html.match(/var\s+pdpTrackingData\s*=\s*"((?:\\.|[^"\\])*)"/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(JSON.parse(`"${match[1]}"`)) as LazadaTrackingData;
  } catch {
    return null;
  }
}

function parsePrice(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const price = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(price) ? price : null;
}

function getQueryParam(url: string, key: string): string | null {
  try {
    return new URL(url).searchParams.get(key);
  } catch {
    return null;
  }
}

export function extractRedMartPromotionText(htmlOrText: string): string | undefined {
  const promos = [
    ...htmlOrText.matchAll(/Any\s+\d+\s+Save\s+\d+(?:\.\d+)?%/gi),
    ...htmlOrText.matchAll(/Spend\s+\$?\d+(?:\.\d+)?\s+\+\s+free gift/gi)
  ].map((match) => normalizeSpaces(match[0]));
  const uniquePromos = [...new Set(promos)];

  return uniquePromos.length > 0 ? uniquePromos.join("; ") : undefined;
}

export function extractRedMartRenderedPrice(pageText: string): number | undefined {
  const priceBlock = pageText.match(/\n\$(\d+(?:\.\d{1,2})?)\n(?:\$\d+(?:\.\d{1,2})\n-\d+%|Only\s+\d+\s+items left|Promotions|Add to cart)/i);
  const visibleSalePrice = priceBlock?.[1] ? Number(priceBlock[1]) : NaN;
  if (Number.isFinite(visibleSalePrice)) {
    return visibleSalePrice;
  }

  const firstPrice = pageText.match(/\$(\d+(?:\.\d{1,2})?)/);
  const parsed = firstPrice?.[1] ? Number(firstPrice[1]) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function extractRedMartRenderedSize(pageText: string): string | undefined {
  const packSize = pageText.match(/Pack Size\s+([0-9][^\n]{0,24})/i);
  return packSize?.[1] ? normalizeSpaces(packSize[1]) : undefined;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
