import { prisma } from "@/lib/db";
import type { LatestPrice } from "@/lib/data/seed-data";
import { calculateBestValue } from "@/lib/pricing/promotion-value";

type CachedPriceRow = {
  price: unknown;
  unitPrice: unknown;
  promotionText: string | null;
  isAvailable: boolean;
  capturedAt: Date | string;
  retailerListing: {
    productUrl: string;
    totalSize: number | null;
    retailer: {
      slug: string;
      name: string;
    };
    canonicalProduct: {
      slug: string;
      packCount: number;
      unitSize: number;
      totalSize: number;
      unit: string;
    } | null;
  };
};

type CachedPriceClient = {
  priceSnapshot: {
    findMany: (args: any) => Promise<CachedPriceRow[]>;
  };
};

type CachedPriceOptions = {
  productSlug?: string;
};

export async function getCachedLatestPrices(
  client: CachedPriceClient = prisma as unknown as CachedPriceClient,
  options: CachedPriceOptions = {}
): Promise<LatestPrice[]> {
  try {
    const rows = await client.priceSnapshot.findMany({
      where: {
        retailerListing: {
          retailer: {
            isActive: true
          },
          canonicalProduct: {
            isActive: true,
            ...(options.productSlug ? { slug: options.productSlug } : {})
          }
        }
      },
      orderBy: { capturedAt: "desc" },
      take: 100,
      include: {
        retailerListing: {
          include: {
            retailer: true,
            canonicalProduct: true
          }
        }
      }
    });

    return rows
      .filter((row) => row.retailerListing.canonicalProduct)
      .filter(isLatestRetailerProductRow)
      .map(mapCachedPriceRow);
  } catch {
    return [];
  }
}

function isLatestRetailerProductRow(
  row: CachedPriceRow,
  index: number,
  rows: CachedPriceRow[]
) {
  const productSlug = row.retailerListing.canonicalProduct?.slug;
  const retailerSlug = row.retailerListing.retailer.slug;
  return (
    rows.findIndex(
      (candidate) =>
        candidate.retailerListing.canonicalProduct?.slug === productSlug &&
        candidate.retailerListing.retailer.slug === retailerSlug
    ) === index
  );
}

function mapCachedPriceRow(row: CachedPriceRow): LatestPrice {
  const product = row.retailerListing.canonicalProduct;
  if (!product) {
    throw new Error("Cannot map cached price without a canonical product");
  }

  const price = toNumber(row.price);
  const totalSize = row.retailerListing.totalSize ?? product.totalSize;
  const promotionText = row.promotionText;
  const value = calculateBestValue(price, totalSize, promotionText);
  const capturedAt =
    row.capturedAt instanceof Date ? row.capturedAt.toISOString() : row.capturedAt;
  const scrapeStatus = row.isAvailable ? ("available" as const) : ("unavailable" as const);

  return {
    productSlug: product.slug,
    retailerSlug: row.retailerListing.retailer.slug,
    retailerName: row.retailerListing.retailer.name,
    price,
    unitPrice: row.unitPrice === null ? null : toNumber(row.unitPrice),
    effectivePrice: value.effectivePrice,
    effectiveUnitPrice: value.effectiveUnitPrice,
    dealQuantity: value.dealQuantity,
    promotionText,
    capturedAt,
    productUrl: row.retailerListing.productUrl,
    isAvailable: row.isAvailable,
    scrapeStatus,
    statusMessage: scrapeStatus === "unavailable" ? promotionText ?? "Unavailable" : null,
    source: "cached-price-snapshot"
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return Number(value);
}
