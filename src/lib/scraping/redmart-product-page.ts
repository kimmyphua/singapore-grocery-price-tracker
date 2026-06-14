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

type ProductJsonLd = {
  "@type"?: unknown;
  name?: unknown;
  sku?: unknown;
  brand?: unknown;
  image?: unknown;
  offers?: unknown;
};

type RedMartPromotionProduct = {
  itemId?: unknown;
  link?: unknown;
  skuId?: unknown;
  tags?: unknown;
  title?: unknown;
};

type RedMartPromotionTarget = {
  productUrl: string;
  retailerSku?: string;
  titleRaw: string;
};

export function parseRedMartProductPage(
  html: string,
  productUrl: string
): ParsedRetailerProduct {
  const $ = cheerio.load(html);
  const trackingData = extractTrackingData(html);
  const structuredData = extractProductJsonLd($);
  const title =
    trackingData?.pdt_name ??
    getString(structuredData?.name) ??
    $("meta[property='og:title']").attr("content")?.replace(/\s*\|\s*Lazada Singapore$/, "");

  if (!title) {
    throw new Error("RedMart/Lazada product data was not found");
  }

  const trackingPrice = parsePrice(trackingData?.pdt_price);
  const structuredOffer = getOffer(structuredData?.offers);
  const structuredPrice = parsePrice(getString(structuredOffer?.price));
  const queryPrice = parsePrice(getQueryParam(productUrl, "price"));
  const price = chooseBestVisiblePrice(
    chooseBestVisiblePrice(trackingPrice, structuredPrice),
    queryPrice
  );
  const structuredImage = getImage(structuredData?.image);
  const structuredBrand = getBrand(structuredData?.brand);
  const structuredAvailability = getString(structuredOffer?.availability);

  return {
    retailerSlug: "redmart",
    titleRaw: title,
    price,
    originalPrice: getRedMartOriginalPrice(trackingPrice, price),
    productUrl,
    imageUrl:
      $("meta[property='og:image']").attr("content") ?? structuredImage,
    isAvailable:
      getQueryParam(productUrl, "stock") !== "0" &&
      !structuredAvailability?.endsWith("/OutOfStock"),
    retailerSku: String(
      trackingData?.pdt_simplesku ??
        trackingData?.pdt_sku ??
        getString(structuredData?.sku) ??
        ""
    ),
    brandRaw: trackingData?.brand_name ?? structuredBrand,
    currency:
      trackingData?.core?.currencyCode ??
      getString(structuredOffer?.priceCurrency) ??
      "SGD",
    promotionText: extractRedMartPromotionText(html)
  };
}

function extractProductJsonLd(
  $: ReturnType<typeof cheerio.load>
): ProductJsonLd | null {
  let product: ProductJsonLd | null = null;

  $("script[type='application/ld+json']").each((_, element) => {
    if (product) {
      return;
    }

    const parsed = safeJsonParse($(element).text());
    product = findProductJsonLd(parsed);
  });

  return product;
}

function findProductJsonLd(value: unknown): ProductJsonLd | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const product = findProductJsonLd(item);
      if (product) {
        return product;
      }
    }
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
    return record;
  }

  return findProductJsonLd(record["@graph"]);
}

function getOffer(value: unknown): Record<string, unknown> | null {
  const offer = Array.isArray(value) ? value[0] : value;
  return offer && typeof offer === "object"
    ? (offer as Record<string, unknown>)
    : null;
}

function getString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

function getBrand(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    return getString((value as Record<string, unknown>).name);
  }
  return undefined;
}

function getImage(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return getString(value[0]);
  }
  return undefined;
}

function chooseBestVisiblePrice(
  trackingPrice: number | null,
  queryPrice: number | null
): number | null {
  const prices = [trackingPrice, queryPrice].filter(
    (price): price is number => price !== null
  );

  return prices.length > 0 ? Math.min(...prices) : null;
}

function getRedMartOriginalPrice(
  trackingPrice: number | null,
  currentPrice: number | null
): number | null {
  if (trackingPrice === null || currentPrice === null || trackingPrice <= currentPrice + 0.005) {
    return null;
  }

  return trackingPrice;
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
  return Number.isFinite(price) && price > 0 ? price : null;
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
    ...htmlOrText.matchAll(/Any\s+\d+\s+Save\s+\$\d+(?:\.\d+)?/gi),
    ...htmlOrText.matchAll(/Any\s+\d+\s+Save\s+\d+(?:\.\d+)?%/gi),
    ...htmlOrText.matchAll(/Spend\s+\$?\d+(?:\.\d+)?\s+\+\s+free gift/gi)
  ].map((match) => normalizePromotionLabel(match[0]));
  const uniquePromos = [...new Set(promos)];

  return uniquePromos.length > 0 ? uniquePromos.join("; ") : undefined;
}

export function extractRedMartPromotionTextFromApiPayload(
  payloads: string[],
  target: RedMartPromotionTarget
): string | undefined {
  const promos: string[] = [];

  for (const payload of payloads) {
    const parsed = safeJsonParse(payload);
    if (!parsed) {
      continue;
    }

    for (const group of findPromotionGroups(parsed)) {
      const titlePromotion = extractRedMartPromotionText(String(group.title));

      for (const product of group.products) {
        if (!isMatchingPromotionProduct(product, target)) {
          continue;
        }

        if (titlePromotion) {
          promos.push(titlePromotion);
        }
        promos.push(...extractTagPromotions(product.tags));
      }
    }
  }

  return formatPromotionText(promos);
}

export function extractRedMartRenderedPrice(pageText: string): number | undefined {
  const priceBlock = pageText.match(/\n\$(\d+(?:\.\d{1,2})?)\n(?:\$\d+(?:\.\d{1,2})\n-\d+%|Only\s+\d+\s+items left|Promotions|Add to cart)/i);
  const visibleSalePrice = priceBlock?.[1] ? Number(priceBlock[1]) : NaN;
  if (Number.isFinite(visibleSalePrice) && visibleSalePrice > 0) {
    return visibleSalePrice;
  }

  const firstPrice = pageText.match(/\$(\d+(?:\.\d{1,2})?)/);
  const parsed = firstPrice?.[1] ? Number(firstPrice[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function extractRedMartRenderedOriginalPrice(pageText: string): number | undefined {
  const saleAndOriginal = pageText.match(
    /\n\$(\d+(?:\.\d{1,2})?)\n\$(\d+(?:\.\d{1,2})?)\n-\d+%/i
  );
  const salePrice = saleAndOriginal?.[1] ? Number(saleAndOriginal[1]) : NaN;
  const originalPrice = saleAndOriginal?.[2] ? Number(saleAndOriginal[2]) : NaN;

  if (Number.isFinite(salePrice) && Number.isFinite(originalPrice) && originalPrice > salePrice) {
    return originalPrice;
  }

  return undefined;
}

export function extractRedMartRenderedSize(pageText: string): string | undefined {
  const packSize = pageText.match(/Pack Size\s+([0-9][^\n]{0,24})/i);
  return packSize?.[1] ? normalizeSpaces(packSize[1]) : undefined;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function safeJsonParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function findPromotionGroups(value: unknown): Array<{
  title: string;
  products: RedMartPromotionProduct[];
}> {
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const products = Object.values(record).find(isPromotionProductArray);
  const title = typeof record.title === "string" ? record.title : undefined;
  const current = title && products ? [{ title, products }] : [];

  return [
    ...current,
    ...Object.values(record).flatMap((child) => {
      if (Array.isArray(child)) {
        return child.flatMap(findPromotionGroups);
      }

      return findPromotionGroups(child);
    })
  ];
}

function isPromotionProductArray(value: unknown): value is RedMartPromotionProduct[] {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        ("skuId" in item || "itemId" in item || "link" in item)
    )
  );
}

function isMatchingPromotionProduct(
  product: RedMartPromotionProduct,
  target: RedMartPromotionTarget
) {
  const retailerSku = target.retailerSku ? String(target.retailerSku) : "";
  const itemId = getRedMartItemId(target.productUrl);
  const link = typeof product.link === "string" ? product.link : "";
  const title = typeof product.title === "string" ? product.title : "";

  return (
    Boolean(retailerSku && String(product.skuId ?? "") === retailerSku) ||
    Boolean(retailerSku && link.includes(`-s${retailerSku}`)) ||
    Boolean(itemId && String(product.itemId ?? "") === itemId) ||
    Boolean(itemId && link.includes(`pdp-i${itemId}-`)) ||
    normalizeComparableText(title) === normalizeComparableText(target.titleRaw)
  );
}

function extractTagPromotions(tags: unknown) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags.flatMap((tag) => {
    if (!tag || typeof tag !== "object" || !("text" in tag)) {
      return [];
    }

    const text = (tag as { text?: unknown }).text;
    return typeof text === "string" ? [text] : [];
  });
}

function formatPromotionText(promos: string[]) {
  const normalized = promos
    .map((promo) => extractRedMartPromotionText(promo) ?? normalizePromotionLabel(promo))
    .filter(Boolean);
  const uniquePromos = [...new Set(normalized)];

  return uniquePromos.length > 0 ? uniquePromos.join("; ") : undefined;
}

function normalizePromotionLabel(value: string) {
  const text = normalizeSpaces(value);
  const freeGift = text.match(/Spend\s+\$?(\d+(?:\.\d+)?)\s+\+\s+free gift/i);
  if (freeGift) {
    return `Spend $${Number(freeGift[1]).toFixed(2)} + free gift`;
  }

  return text;
}

function getRedMartItemId(url: string) {
  return url.match(/pdp-i(\d+)/)?.[1] ?? "";
}

function normalizeComparableText(value: string) {
  return normalizeSpaces(value).toLowerCase();
}
