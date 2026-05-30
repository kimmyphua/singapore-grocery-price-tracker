import * as cheerio from "cheerio";
import type { ParsedRetailerProduct } from "./product-page-types";

type ProductJsonLd = {
  "@type"?: string;
  name?: string;
  image?: string | string[];
  sku?: string;
  brand?: { name?: string } | string;
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    availability?: string;
  };
};

export function parseFairPriceProductPage(
  html: string,
  productUrl: string
): ParsedRetailerProduct {
  const $ = cheerio.load(html);
  const pageText = normalizeSpaces($.text());
  const productJson = $("script[type='application/ld+json']")
    .toArray()
    .map((element) => parseJsonLd($(element).text()))
    .find((json): json is ProductJsonLd => json?.["@type"] === "Product");

  if (!productJson?.name) {
    throw new Error("FairPrice product JSON-LD was not found");
  }

  const image = Array.isArray(productJson.image)
    ? productJson.image[0]
    : productJson.image;
  const availability = productJson.offers?.availability?.trim().toLowerCase() ?? "";

  return {
    retailerSlug: "fairprice",
    titleRaw: productJson.name,
    price: parsePrice(productJson.offers?.price),
    productUrl,
    imageUrl: image,
    isAvailable: !availability.includes("outofstock"),
    retailerSku: productJson.sku,
    brandRaw:
      typeof productJson.brand === "string"
        ? productJson.brand
        : productJson.brand?.name,
    currency: productJson.offers?.priceCurrency,
    promotionText: extractFairPricePromotionText(html, pageText, productJson),
    size: extractFairPriceSize(pageText, productJson.name)
  };
}

function extractFairPricePromotionText(
  html: string,
  pageText: string,
  productJson: ProductJsonLd
): string | undefined {
  const scopedPromotion = extractProductScopedPromotionText(html, productJson);
  if (scopedPromotion !== null) {
    return scopedPromotion;
  }

  const promos = [
    ...pageText.matchAll(/Any\s+\d+\s+(?:for|At|@)\s+\$?\d+(?:\.\d+)?/gi),
    ...pageText.matchAll(/Buy\s+\d+\s+At\s+\$?\d+(?:\.\d+)?/gi),
    ...pageText.matchAll(/Save\s+\$?\d+(?:\.\d+)?(?:\s+Till\s+\d{1,2}\w{2}\s+\w+\s+\d{4})?/gi)
  ]
    .map((match) => ({
      index: match.index ?? Number.MAX_SAFE_INTEGER,
      text: normalizeSpaces(match[0]).replace(/\s+At\s+/i, " @ ")
    }))
    .sort((left, right) => left.index - right.index);

  const uniquePromo = promos.find(
    (promo, index) => promos.findIndex((candidate) => candidate.text === promo.text) === index
  );

  return uniquePromo?.text;
}

function extractProductScopedPromotionText(
  html: string,
  productJson: ProductJsonLd
): string | undefined | null {
  if (!productJson.sku) {
    return null;
  }

  const marker = `"item":{"id":${productJson.sku}}`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const productSlice = html.slice(markerIndex, markerIndex + 16000);
  const offerText = extractScopedOfferText(productSlice);
  if (offerText) {
    return offerText;
  }

  const discount = productSlice.match(/"discount":"(\d+(?:\.\d+)?)"/);
  if (discount && Number(discount[1]) > 0) {
    return `Save $${discount[1]}`;
  }

  return undefined;
}

function extractScopedOfferText(productSlice: string): string | undefined {
  const offersIndex = productSlice.indexOf('"offers":');
  if (offersIndex === -1) {
    return undefined;
  }

  const offersSlice = productSlice.slice(offersIndex, offersIndex + 3000);
  if (offersSlice.startsWith('"offers":null')) {
    return undefined;
  }

  const description = offersSlice.match(/"description":"((?:\\.|[^"\\])*)"/);
  if (!description?.[1]) {
    return undefined;
  }

  const offerText = normalizeSpaces(unescapeJsonString(description[1])).replace(/\s+At\s+/i, " @ ");
  const quantity = offerText.match(/\b(?:Any|Buy)\s+(\d+)\b/i);
  if (quantity && Number(quantity[1]) <= 1) {
    return undefined;
  }

  return offerText;
}

function extractFairPriceSize(pageText: string, productName: string): string | undefined {
  const escapedName = escapeRegExp(productName);
  const nearTitle = pageText.match(new RegExp(`${escapedName}\\s*([0-9][^|]{0,24})\\|Brand`, "i"));
  if (nearTitle?.[1]) {
    return normalizeSpaces(nearTitle[1]);
  }

  const pack = pageText.match(/\b\d+\s*x\s*\d+(?:\.\d+)?\s*(?:ml|g|l)\b/i);
  if (pack?.[0]) {
    return normalizeSpaces(pack[0]);
  }

  const single = pageText.match(/\b\d+(?:\.\d+)?\s*(?:ml|g|l)\b/i);
  return single?.[0] ? normalizeSpaces(single[0]) : undefined;
}

function parseJsonLd(text: string): ProductJsonLd | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as ProductJsonLd;
  } catch {
    return parseBalancedJsonPrefix(trimmed);
  }
}

function parseBalancedJsonPrefix(text: string): ProductJsonLd | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(0, index + 1)) as ProductJsonLd;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function parsePrice(value: string | number | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const price = Number(value);
  return Number.isFinite(price) ? price : null;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
