import * as cheerio from "cheerio";
import type { ParsedRetailerProduct } from "./product-page-types";

type ColdStoragePayload = {
  name?: string;
  price?: number;
  promoPrice?: number;
  image?: string;
  inventoryStatus?: string;
  discountLabel?: string;
  sku?: string;
  size?: string;
};

export function parseColdStorageProductPage(
  html: string,
  productUrl: string
): ParsedRetailerProduct {
  const $ = cheerio.load(html);
  const payload = extractProductPayload(html);
  const title = payload?.name ?? cleanTitle($("meta[property='og:title']").attr("content"));

  if (!title) {
    throw new Error("Cold Storage product data was not found");
  }

  return {
    retailerSlug: "cold-storage",
    titleRaw: title,
    price: payload?.promoPrice ?? payload?.price ?? null,
    productUrl,
    imageUrl: payload?.image ?? $("meta[property='og:image']").attr("content"),
    isAvailable: payload?.inventoryStatus?.toLowerCase() !== "out of stock",
    retailerSku: payload?.sku,
    brandRaw: title.split(/\s+/)[0],
    currency: "SGD",
    promotionText: payload?.discountLabel || undefined,
    size: payload?.size
  };
}

function extractProductPayload(html: string): ColdStoragePayload | null {
  const nameIndex = html.indexOf('\\"product\\":{\\"productId\\"');
  if (nameIndex === -1) {
    return null;
  }

  const objectStart = html.indexOf("{", nameIndex);
  const objectEnd = html.indexOf(',\\"relatedProducts\\"', objectStart);
  if (objectStart === -1) {
    return null;
  }

  if (objectEnd === -1) {
    return parseBalancedObject(html.slice(objectStart));
  }

  const escapedObject = html.slice(objectStart, objectEnd) + "}";
  try {
    return JSON.parse(unescapeNextPayload(escapedObject)) as ColdStoragePayload;
  } catch {
    return null;
  }
}

function parseBalancedObject(escapedValue: string): ColdStoragePayload | null {
  const text = unescapeNextPayload(escapedValue);
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
          return JSON.parse(text.slice(0, index + 1)) as ColdStoragePayload;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function unescapeNextPayload(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\u0026/g, "&")
    .replace(/\\\\/g, "\\");
}

function cleanTitle(value: string | undefined): string | undefined {
  return value?.replace(/\s*\|\s*Cold Storage$/, "").trim();
}
