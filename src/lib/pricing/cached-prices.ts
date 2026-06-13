import type {
  LatestPrice,
  PriceHistory,
  WeeklyPriceHistoryResult,
  WeeklyPriceHistorySort
} from "@/lib/data/seed-data";
import {
  getTrackedProductRows,
  type TrackedProductQueryClient
} from "@/lib/products/queries";
import { calculateBestValue } from "@/lib/pricing/promotion-value";

type CachedPriceOptions = {
  ownerId?: string;
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

type OwnedSnapshotRow = {
  productId: string;
  productName: string;
  productSlug: string;
  productTotalSize: number;
  price: unknown;
  originalPrice: unknown;
  unitPrice: unknown;
  promotionText: string | null;
  isAvailable: boolean;
  capturedAt: Date | string;
  retailerListing: {
    id: string;
    productUrl: string;
    totalSize: number | null;
    retailer: {
      slug: string;
      name: string;
    };
  };
};

export type OwnedLatestPrice = LatestPrice & {
  productId: string;
  productName: string;
};

export async function getCachedLatestPrices(
  client?: TrackedProductQueryClient,
  options: CachedPriceOptions = {}
): Promise<OwnedLatestPrice[]> {
  if (!options.ownerId) {
    return [];
  }

  try {
    const products = await getTrackedProductRows(
      client,
      options.ownerId,
      { productSlug: options.productSlug }
    );
    const rows = flattenSnapshots(products);

    return rows
      .filter(hasPositiveSnapshotPrice)
      .filter(isLatestRetailerProductRow)
      .map(mapCachedPriceRow);
  } catch {
    return [];
  }
}

export async function getCachedWeeklyPriceHistory(
  client?: TrackedProductQueryClient,
  options: WeeklyPriceHistoryOptions = {}
): Promise<WeeklyPriceHistoryResult> {
  if (!options.ownerId) {
    return paginateWeeklyHistory([], options);
  }

  try {
    const products = await getTrackedProductRows(
      client,
      options.ownerId,
      { productSlug: options.productSlug }
    );
    const rows = flattenSnapshots(products);
    const historyRows = rows
      .filter(hasPositiveSnapshotPrice)
      .filter(isRetailerProductChangeRow)
      .map((row) => ({
        ...mapCachedPriceRow(row),
        date: getSingaporeDate(row.capturedAt)
      }))
      .filter((row) => matchesWeeklyHistoryFilters(row, options))
      .sort((left, right) => compareWeeklyHistoryRows(left, right, options));

    return paginateWeeklyHistory(historyRows, options);
  } catch {
    return paginateWeeklyHistory([], options);
  }
}

function flattenSnapshots(
  products: Awaited<ReturnType<typeof getTrackedProductRows>>
): OwnedSnapshotRow[] {
  return products
    .flatMap((product) =>
      product.listings.flatMap(({ retailerListing }) =>
        retailerListing.retailer.isActive
          ? retailerListing.priceSnapshots.map((snapshot) => ({
              productId: product.id,
              productName: product.name,
              productSlug: product.slug,
              productTotalSize: product.totalSize,
              price: snapshot.price,
              originalPrice: snapshot.originalPrice,
              unitPrice: snapshot.unitPrice,
              promotionText: snapshot.promotionText,
              isAvailable: snapshot.isAvailable,
              capturedAt: snapshot.capturedAt,
              retailerListing: {
                id: retailerListing.id,
                productUrl: retailerListing.productUrl,
                totalSize: retailerListing.totalSize,
                retailer: {
                  slug: retailerListing.retailer.slug,
                  name: retailerListing.retailer.name
                }
              }
            }))
          : []
      )
    )
    .sort(
      (left, right) =>
        getTimestamp(right.capturedAt) - getTimestamp(left.capturedAt)
    );
}

function hasPositiveSnapshotPrice(row: OwnedSnapshotRow) {
  return toNumber(row.price) > 0;
}

function isLatestRetailerProductRow(
  row: OwnedSnapshotRow,
  index: number,
  rows: OwnedSnapshotRow[]
) {
  return (
    rows.findIndex(
      (candidate) =>
        candidate.productId === row.productId &&
        candidate.retailerListing.retailer.slug ===
          row.retailerListing.retailer.slug
    ) === index
  );
}

function isRetailerProductChangeRow(
  row: OwnedSnapshotRow,
  index: number,
  rows: OwnedSnapshotRow[]
) {
  const newerRow = rows
    .slice(0, index)
    .find(
      (candidate) =>
        candidate.productId === row.productId &&
        candidate.retailerListing.retailer.slug ===
          row.retailerListing.retailer.slug
    );

  return (
    !newerRow ||
    getPriceHistorySignature(row) !== getPriceHistorySignature(newerRow)
  );
}

function getPriceHistorySignature(row: OwnedSnapshotRow) {
  return [
    toNumber(row.price).toFixed(4),
    row.originalPrice === null || row.originalPrice === undefined
      ? ""
      : toNumber(row.originalPrice).toFixed(4),
    normalizePromotionText(row.promotionText),
    row.isAvailable ? "available" : "unavailable"
  ].join("|");
}

function normalizePromotionText(value: string | null) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function mapCachedPriceRow(row: OwnedSnapshotRow): OwnedLatestPrice {
  const price = toNumber(row.price);
  const originalPrice =
    row.originalPrice === null || row.originalPrice === undefined
      ? null
      : toNumber(row.originalPrice);
  const totalSize =
    row.retailerListing.totalSize ?? row.productTotalSize;
  const promotionText =
    row.promotionText ?? getInferredSavingsText(price, originalPrice);
  const value = calculateBestValue(price, totalSize, promotionText);
  const capturedAt =
    row.capturedAt instanceof Date
      ? row.capturedAt.toISOString()
      : row.capturedAt;
  const scrapeStatus = row.isAvailable
    ? ("available" as const)
    : ("unavailable" as const);

  return {
    productId: row.productId,
    productName: row.productName,
    productSlug: row.productSlug,
    retailerSlug: row.retailerListing.retailer.slug,
    retailerName: row.retailerListing.retailer.name,
    price,
    originalPrice,
    unitPrice:
      row.unitPrice === null || row.unitPrice === undefined
        ? null
        : toNumber(row.unitPrice),
    effectivePrice: value.effectivePrice,
    effectiveUnitPrice: value.effectiveUnitPrice,
    dealQuantity: value.dealQuantity,
    promotionText,
    capturedAt,
    productUrl: row.retailerListing.productUrl,
    isAvailable: row.isAvailable,
    scrapeStatus,
    statusMessage:
      scrapeStatus === "unavailable"
        ? promotionText ?? "Unavailable"
        : null,
    source: "cached-price-snapshot"
  };
}

function getInferredSavingsText(
  price: number | null,
  originalPrice: number | null
) {
  if (
    price === null ||
    originalPrice === null ||
    originalPrice <= price + 0.005
  ) {
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

function getSingaporeDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const singaporeDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return singaporeDate.toISOString().slice(0, 10);
}

function getTimestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function matchesWeeklyHistoryFilters(
  row: PriceHistory,
  options: WeeklyPriceHistoryOptions
) {
  if (options.retailerSlug && row.retailerSlug !== options.retailerSlug) {
    return false;
  }

  const query = options.query?.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return [
    row.retailerName,
    row.retailerSlug,
    row.promotionText ?? "",
    row.date
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function compareWeeklyHistoryRows(
  left: PriceHistory,
  right: PriceHistory,
  options: WeeklyPriceHistoryOptions
) {
  const direction = options.direction === "asc" ? 1 : -1;
  const sort = options.sort ?? "date";
  const comparison = compareBySort(left, right, sort);

  return comparison === 0
    ? compareBySort(left, right, "retailer")
    : comparison * direction;
}

function compareBySort(
  left: PriceHistory,
  right: PriceHistory,
  sort: WeeklyPriceHistorySort
) {
  if (sort === "retailer") {
    return left.retailerName.localeCompare(right.retailerName);
  }
  if (sort === "shelfPrice") {
    return compareNullableNumbers(
      getDisplayedOriginalPrice(left),
      getDisplayedOriginalPrice(right)
    );
  }
  if (sort === "dealPrice") {
    return compareNullableNumbers(left.effectivePrice, right.effectivePrice);
  }
  if (sort === "unitValue") {
    return compareNullableNumbers(
      left.effectiveUnitPrice,
      right.effectiveUnitPrice
    );
  }
  return (
    left.date.localeCompare(right.date) ||
    getTimestamp(left.capturedAt) - getTimestamp(right.capturedAt)
  );
}

function getDisplayedOriginalPrice(row: PriceHistory) {
  return row.originalPrice ?? row.price;
}

function compareNullableNumbers(
  left: number | null,
  right: number | null
) {
  return (left ?? Infinity) - (right ?? Infinity);
}

function paginateWeeklyHistory(
  rows: PriceHistory[],
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
