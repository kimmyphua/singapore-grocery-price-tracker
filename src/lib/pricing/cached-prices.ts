import { prisma } from "@/lib/db";
import type {
  LatestPrice,
  WeeklyPriceHistory,
  WeeklyPriceHistoryResult,
  WeeklyPriceHistorySort
} from "@/lib/data/seed-data";
import { calculateBestValue } from "@/lib/pricing/promotion-value";

type CachedPriceRow = {
  price: unknown;
  originalPrice?: unknown;
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

type WeeklyPriceHistoryOptions = CachedPriceOptions & {
  retailerSlug?: string;
  query?: string;
  sort?: WeeklyPriceHistorySort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
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
      .filter(hasPositiveSnapshotPrice)
      .filter(isLatestRetailerProductRow)
      .map(mapCachedPriceRow);
  } catch {
    return [];
  }
}

export async function getCachedWeeklyPriceHistory(
  client: CachedPriceClient = prisma as unknown as CachedPriceClient,
  options: WeeklyPriceHistoryOptions = {}
): Promise<WeeklyPriceHistoryResult> {
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
      take: 500,
      include: {
        retailerListing: {
          include: {
            retailer: true,
            canonicalProduct: true
          }
        }
      }
    });

    const weeklyRows = [...rows]
      .sort((left, right) => getTimestamp(right.capturedAt) - getTimestamp(left.capturedAt))
      .filter((row) => row.retailerListing.canonicalProduct)
      .filter(hasPositiveSnapshotPrice)
      .filter(isLatestRetailerProductWeekRow)
      .map((row) => ({
        ...mapCachedPriceRow(row),
        weekStart: getSingaporeWeekStart(row.capturedAt)
      }))
      .filter((row) => matchesWeeklyHistoryFilters(row, options))
      .sort((left, right) => compareWeeklyHistoryRows(left, right, options));

    return paginateWeeklyHistory(weeklyRows, options);
  } catch {
    return paginateWeeklyHistory([], options);
  }
}

function hasPositiveSnapshotPrice(row: CachedPriceRow) {
  return toNumber(row.price) > 0;
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

function isLatestRetailerProductWeekRow(
  row: CachedPriceRow,
  index: number,
  rows: CachedPriceRow[]
) {
  const productSlug = row.retailerListing.canonicalProduct?.slug;
  const retailerSlug = row.retailerListing.retailer.slug;
  const weekStart = getSingaporeWeekStart(row.capturedAt);

  return (
    rows.findIndex(
      (candidate) =>
        candidate.retailerListing.canonicalProduct?.slug === productSlug &&
        candidate.retailerListing.retailer.slug === retailerSlug &&
        getSingaporeWeekStart(candidate.capturedAt) === weekStart
    ) === index
  );
}

function mapCachedPriceRow(row: CachedPriceRow): LatestPrice {
  const product = row.retailerListing.canonicalProduct;
  if (!product) {
    throw new Error("Cannot map cached price without a canonical product");
  }

  const price = toNumber(row.price);
  const originalPrice = row.originalPrice === null || row.originalPrice === undefined
    ? null
    : toNumber(row.originalPrice);
  const totalSize = row.retailerListing.totalSize ?? product.totalSize;
  const promotionText = row.promotionText ?? getInferredSavingsText(price, originalPrice);
  const value = calculateBestValue(price, totalSize, promotionText);
  const capturedAt =
    row.capturedAt instanceof Date ? row.capturedAt.toISOString() : row.capturedAt;
  const scrapeStatus = row.isAvailable ? ("available" as const) : ("unavailable" as const);

  return {
    productSlug: product.slug,
    retailerSlug: row.retailerListing.retailer.slug,
    retailerName: row.retailerListing.retailer.name,
    price,
    originalPrice,
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

function getInferredSavingsText(price: number | null, originalPrice: number | null) {
  if (price === null || originalPrice === null || originalPrice <= price + 0.005) {
    return null;
  }

  return `Save $${(originalPrice - price).toFixed(2)}`;
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

function getSingaporeWeekStart(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const singaporeDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const day = singaporeDate.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(
      singaporeDate.getUTCFullYear(),
      singaporeDate.getUTCMonth(),
      singaporeDate.getUTCDate() - daysSinceMonday
    )
  );

  return monday.toISOString().slice(0, 10);
}

function getTimestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function matchesWeeklyHistoryFilters(
  row: WeeklyPriceHistory,
  options: WeeklyPriceHistoryOptions
) {
  if (options.retailerSlug && row.retailerSlug !== options.retailerSlug) {
    return false;
  }

  const query = options.query?.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return [row.retailerName, row.retailerSlug, row.promotionText ?? "", row.weekStart]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function compareWeeklyHistoryRows(
  left: WeeklyPriceHistory,
  right: WeeklyPriceHistory,
  options: WeeklyPriceHistoryOptions
) {
  const direction = options.direction === "asc" ? 1 : -1;
  const sort = options.sort ?? "week";
  const comparison = compareBySort(left, right, sort);

  return comparison === 0
    ? compareBySort(left, right, "retailer")
    : comparison * direction;
}

function compareBySort(
  left: WeeklyPriceHistory,
  right: WeeklyPriceHistory,
  sort: WeeklyPriceHistorySort
) {
  if (sort === "retailer") {
    return left.retailerName.localeCompare(right.retailerName);
  }

  if (sort === "shelfPrice") {
    return compareNullableNumbers(getDisplayedOriginalPrice(left), getDisplayedOriginalPrice(right));
  }

  if (sort === "dealPrice") {
    return compareNullableNumbers(left.effectivePrice, right.effectivePrice);
  }

  if (sort === "unitValue") {
    return compareNullableNumbers(left.effectiveUnitPrice, right.effectiveUnitPrice);
  }

  return left.weekStart.localeCompare(right.weekStart) || getTimestamp(left.capturedAt) - getTimestamp(right.capturedAt);
}

function getDisplayedOriginalPrice(row: WeeklyPriceHistory) {
  return row.originalPrice ?? row.price;
}

function compareNullableNumbers(left: number | null, right: number | null) {
  return (left ?? Infinity) - (right ?? Infinity);
}

function paginateWeeklyHistory(
  rows: WeeklyPriceHistory[],
  options: WeeklyPriceHistoryOptions
): WeeklyPriceHistoryResult {
  const pageSize = clampInteger(options.pageSize, 10, 1, 50);
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = clampInteger(options.page, 1, 1, totalPages);
  const start = (page - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    totalRows,
    page,
    pageSize,
    totalPages
  };
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}
