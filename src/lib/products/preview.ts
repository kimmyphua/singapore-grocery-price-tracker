import {
  normalizeProductTitle,
  parsePackSize
} from "@/lib/products/normalize";
import { z } from "zod";
import type { SupportedProductUrl } from "@/lib/products/url-policy";
import { parseSupportedProductUrl } from "@/lib/products/url-policy";
import { fetchRetailerPage } from "@/lib/scraping/http";
import { parseProductPage } from "@/lib/scraping/parse-product-page";
import type { ParsedRetailerProduct } from "@/lib/scraping/product-page-types";
import type { RetailerSlug } from "@/lib/scraping/types";
import { scrapeRedMartBrowserProductPage } from "@/lib/scraping/redmart-browser-page";
import { scrapeShengSiongProductPage } from "@/lib/scraping/sheng-siong-product-page";

export const productPreviewSchema = z.object({
  retailerSlug: z.enum(["fairprice", "cold-storage", "redmart", "sheng-siong"]),
  canonicalUrl: z.string().url(),
  retailerSku: z.string().min(1).optional(),
  titleRaw: z.string().trim().min(1),
  name: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  family: z.string().trim().min(1),
  flavour: z.string().trim().min(1).nullable(),
  packCount: z.number().int().positive(),
  unitSize: z.number().positive(),
  unit: z.string().trim().min(1),
  totalSize: z.number().positive(),
  imageUrl: z.string().url().nullable(),
  price: z.number().positive(),
  originalPrice: z.number().positive().nullable(),
  promotionText: z.string().trim().min(1).nullable(),
  isAvailable: z.boolean()
});

export type ProductPreview = z.infer<typeof productPreviewSchema>;

export type ProductPreviewErrorCode =
  | "FETCH_FAILED"
  | "PARSE_FAILED"
  | "MISSING_TITLE"
  | "MISSING_BRAND"
  | "INVALID_PRICE"
  | "INVALID_PACK_SIZE"
  | "RETAILER_MISMATCH";

export class ProductPreviewError extends Error {
  constructor(readonly code: ProductPreviewErrorCode) {
    super(code);
    this.name = "ProductPreviewError";
  }
}

type ProductPreviewDependencies = {
  fetchPage?: (
    url: string,
    options?: { delayMs?: number }
  ) => Promise<string>;
  parsePage?: (html: string, url: string) => ParsedRetailerProduct;
  scrapeRedMart?: (url: string) => Promise<ParsedRetailerProduct>;
  scrapeShengSiong?: (url: string) => Promise<ParsedRetailerProduct>;
  deferRedMartToScheduledRefresh?: boolean;
};

export async function previewProductUrl(
  input: string,
  dependencies: ProductPreviewDependencies = {}
): Promise<ProductPreview> {
  const supportedUrl = parseSupportedProductUrl(input);
  const fetchPage = dependencies.fetchPage ?? fetchRetailerPage;
  const parsePage = dependencies.parsePage ?? parseProductPage;
  const scrapeRedMart =
    dependencies.scrapeRedMart ?? scrapeRedMartBrowserProductPage;
  const scrapeShengSiong =
    dependencies.scrapeShengSiong ?? scrapeShengSiongProductPage;

  if (supportedUrl.retailerSlug === "redmart") {
    if (dependencies.deferRedMartToScheduledRefresh) {
      throw new ProductPreviewError("PARSE_FAILED");
    }
    try {
      return buildProductPreview(
        await scrapeRedMart(supportedUrl.canonicalUrl),
        supportedUrl
      );
    } catch (error) {
      logPreviewFailure(supportedUrl, "scrape", error);
      if (error instanceof ProductPreviewError) {
        throw error;
      }
      throw new ProductPreviewError("PARSE_FAILED");
    }
  }

  if (supportedUrl.retailerSlug === "sheng-siong") {
    try {
      return buildProductPreview(
        await scrapeShengSiong(supportedUrl.canonicalUrl),
        supportedUrl
      );
    } catch (error) {
      logPreviewFailure(supportedUrl, "scrape", error);
      if (error instanceof ProductPreviewError) {
        throw error;
      }
      throw new ProductPreviewError("PARSE_FAILED");
    }
  }

  let html: string;

  try {
    html = await fetchPage(supportedUrl.canonicalUrl, { delayMs: 0 });
  } catch (error) {
    logPreviewFailure(supportedUrl, "fetch", error);
    throw new ProductPreviewError("FETCH_FAILED");
  }

  let parsed: ParsedRetailerProduct;
  try {
    parsed = parsePage(html, supportedUrl.canonicalUrl);
  } catch (error) {
    logPreviewFailure(supportedUrl, "parse", error, html);
    throw new ProductPreviewError("PARSE_FAILED");
  }

  return buildProductPreview(parsed, supportedUrl);
}

export function buildProductPreview(
  parsed: ParsedRetailerProduct,
  supportedUrl: SupportedProductUrl
): ProductPreview {
  if (parsed.retailerSlug !== supportedUrl.retailerSlug) {
    throw new ProductPreviewError("RETAILER_MISMATCH");
  }

  const titleRaw = normalizeText(parsed.titleRaw);
  if (!titleRaw) {
    throw new ProductPreviewError("MISSING_TITLE");
  }

  const brand = normalizeText(parsed.brandRaw ?? "");
  if (!brand) {
    throw new ProductPreviewError("MISSING_BRAND");
  }

  if (
    parsed.price === null ||
    !Number.isFinite(parsed.price) ||
    parsed.price <= 0
  ) {
    throw new ProductPreviewError("INVALID_PRICE");
  }

  const sizeSource = normalizeText(`${titleRaw} ${parsed.size ?? ""}`);
  if (!containsPackSize(sizeSource)) {
    throw new ProductPreviewError("INVALID_PACK_SIZE");
  }

  const normalized = normalizeProductTitle(sizeSource);
  const pack = parsePackSize(sizeSource);

  return {
    retailerSlug: supportedUrl.retailerSlug,
    canonicalUrl: supportedUrl.canonicalUrl,
    retailerSku: normalizeOptional(parsed.retailerSku),
    titleRaw,
    name: titleRaw,
    brand,
    family: normalized.family,
    flavour: normalized.flavour,
    ...pack,
    imageUrl: normalizeOptional(parsed.imageUrl) ?? null,
    price: parsed.price,
    originalPrice:
      parsed.originalPrice !== null &&
      Number.isFinite(parsed.originalPrice) &&
      parsed.originalPrice > 0
        ? parsed.originalPrice
        : null,
    promotionText: normalizeOptional(parsed.promotionText) ?? null,
    isAvailable: parsed.isAvailable
  };
}

function containsPackSize(value: string): boolean {
  return (
    /\b\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\b/i.test(
      value
    ) ||
    /\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\b/i.test(value) ||
    /\b(?:pack of|x)\s*\d+\b/i.test(value) ||
    /\b\d+\s*(?:pcs|pieces|s)\b/i.test(value)
  );
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value ? normalizeText(value) : "";
  return normalized || undefined;
}

function logPreviewFailure(
  supportedUrl: SupportedProductUrl,
  stage: "fetch" | "parse" | "scrape",
  error: unknown,
  html?: string
) {
  console.warn("product-preview-failed", {
    retailer: supportedUrl.retailerSlug,
    stage,
    error: error instanceof Error ? error.message : "UNKNOWN",
    htmlBytes: html ? Buffer.byteLength(html) : undefined,
    pageTitle: html?.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()
  });
}
