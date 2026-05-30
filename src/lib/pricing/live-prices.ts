import { products, retailers, type LatestPrice } from "@/lib/data/seed-data";
import { verifiedProductUrls, type VerifiedProductUrl } from "@/lib/data/verified-product-urls";
import { parsePackSize } from "@/lib/products/normalize";
import { calculateBestValue } from "@/lib/pricing/promotion-value";
import { fetchRetailerPage } from "@/lib/scraping/http";
import { parseProductPage } from "@/lib/scraping/parse-product-page";
import { scrapeRedMartBrowserProductPage } from "@/lib/scraping/redmart-browser-page";

export async function getLiveLatestPrices(options: { productSlug?: string } = {}): Promise<LatestPrice[]> {
  const capturedAt = new Date().toISOString();
  const urls = options.productSlug
    ? verifiedProductUrls.filter((verifiedUrl) => verifiedUrl.productSlug === options.productSlug)
    : verifiedProductUrls;
  const settled = await Promise.allSettled(
    urls.map(async (verifiedUrl) => {
      const { productSlug, url } = verifiedUrl;
      const product = products.find((item) => item.slug === productSlug);

      if (!product) {
        return null;
      }

      const scraped = await scrapeProductUrl(verifiedUrl, product);
      const retailer = retailers.find((item) => item.slug === scraped.retailerSlug);
      const pack = parsePackSize(scraped.size ?? product.pack);
      const promotionText = getPromotionText(scraped, verifiedUrl);
      const value =
        scraped.price !== null
          ? calculateBestValue(scraped.price, pack.totalSize, promotionText)
          : null;
      const scrapeStatus = getScrapeStatus(scraped);

      return {
        productSlug,
        retailerSlug: scraped.retailerSlug,
        retailerName: retailer?.name ?? scraped.retailerSlug,
        price: scraped.price,
        unitPrice: scraped.price !== null ? scraped.price / pack.totalSize : null,
        effectivePrice: value?.effectivePrice ?? null,
        effectiveUnitPrice: value?.effectiveUnitPrice ?? null,
        dealQuantity: value?.dealQuantity ?? 1,
        promotionText,
        capturedAt,
        productUrl: url,
        isAvailable: scraped.isAvailable,
        scrapeStatus,
        statusMessage: getStatusMessage(scrapeStatus, promotionText),
        source: "live-product-page" as const
      };
    })
  );

  return settled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
}

async function scrapeProductUrl(
  verifiedUrl: VerifiedProductUrl,
  product?: (typeof products)[number]
) {
  const { url } = verifiedUrl;
  if (url.includes("lazada.sg/products/")) {
    try {
      return await scrapeRedMartBrowserProductPage(url);
    } catch (error) {
      const fallback = buildRedMartUrlFallback(verifiedUrl, product);
      if (fallback) {
        return fallback;
      }

      throw error;
    }
  }

  const html = await fetchRetailerPage(url);
  return parseProductPage(html, url);
}

function getPromotionText(
  scraped: { promotionText?: string; isAvailable: boolean; price: number | null },
  verifiedUrl: VerifiedProductUrl
) {
  if (scraped.price === null) {
    return scraped.promotionText ?? verifiedUrl.fallbackPromotionText ?? null;
  }

  if (!scraped.isAvailable) {
    return scraped.promotionText ? `${scraped.promotionText}; out of stock` : "Out of stock";
  }

  return scraped.promotionText ?? verifiedUrl.fallbackPromotionText ?? null;
}

function buildRedMartUrlFallback(
  verifiedUrl: VerifiedProductUrl,
  product?: (typeof products)[number]
) {
  const price = getQueryPrice(verifiedUrl.url);
  if (!product || price === null) {
    return null;
  }

  return {
    retailerSlug: "redmart" as const,
    titleRaw: [product.brand, product.flavour, product.family].filter(Boolean).join(" "),
    price,
    productUrl: verifiedUrl.url,
    isAvailable: new URL(verifiedUrl.url).searchParams.get("stock") !== "0",
    retailerSku: getRedMartSku(verifiedUrl.url),
    brandRaw: product.brand,
    currency: "SGD",
    promotionText: verifiedUrl.fallbackPromotionText,
    size: product.pack
  };
}

function getQueryPrice(url: string): number | null {
  try {
    const price = Number(new URL(url).searchParams.get("price"));
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

function getRedMartSku(url: string): string | undefined {
  const match = url.match(/-s(\d+)/);
  return match?.[1];
}

function getScrapeStatus(scraped: { price: number | null; isAvailable: boolean }) {
  if (scraped.price === null) {
    return "blocked" as const;
  }

  return scraped.isAvailable ? ("available" as const) : ("unavailable" as const);
}

function getStatusMessage(
  scrapeStatus: "available" | "unavailable" | "blocked",
  promotionText: string | null
) {
  if (scrapeStatus === "blocked") {
    return promotionText ?? "Blocked";
  }

  if (scrapeStatus === "unavailable") {
    return promotionText ?? "Unavailable";
  }

  return null;
}
