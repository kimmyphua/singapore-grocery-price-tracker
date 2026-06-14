import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parsePackSize } from "@/lib/products/normalize";
import { scrapeLiveRetailerListing } from "@/lib/pricing/live-prices";
import type { ParsedRetailerProduct } from "@/lib/scraping/product-page-types";

export type ListingRefreshStatus =
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED"
  | "ALREADY_LOCKED";

export type ListingRefreshResult = {
  listingId: string;
  status: ListingRefreshStatus;
};

export type RefreshSummary = {
  total: number;
  completed: number;
  blocked: number;
  failed: number;
  alreadyLocked: number;
};

type RefreshTrigger = "MANUAL" | "SCHEDULED";

type RefreshListing = {
  id: string;
  productUrl: string;
  totalSize: number | null;
  retailer: {
    slug: string;
    name: string;
  };
};

type AttemptFinishData = {
  status: "COMPLETED" | "BLOCKED" | "FAILED";
  snapshotStored: boolean;
  errorCategory?: string;
  errorMessage?: string;
};

export type ListingRefreshOperations = {
  findListing(id: string): Promise<RefreshListing | null>;
  createAttempt(data: {
    retailerListingId: string;
    trigger: RefreshTrigger;
  }): Promise<{ id: string }>;
  updateListing(
    id: string,
    parsed: ParsedRetailerProduct
  ): Promise<void>;
  createSnapshot(data: {
    retailerListingId: string;
    price: number;
    originalPrice: number | null;
    unitPrice: number;
    promotionText: string | null;
    currency: string;
    isAvailable: boolean;
  }): Promise<void>;
  finishAttempt(id: string, data: AttemptFinishData): Promise<void>;
};

export type SharedListingRefreshStore = ListingRefreshOperations & {
  withListingLock<T>(
    listingId: string,
    operation: (store: ListingRefreshOperations) => Promise<T>
  ): Promise<{ acquired: boolean; value?: T }>;
  resolveOwnerListingIds(
    ownerId: string,
    trackedProductId?: string
  ): Promise<string[]>;
  listActiveListingIds(): Promise<string[]>;
};

export type ListingScraper = (
  listing: RefreshListing
) => Promise<ParsedRetailerProduct>;

export async function refreshRetailerListing(
  store: SharedListingRefreshStore = prismaSharedListingRefreshStore,
  listingId: string,
  trigger: RefreshTrigger,
  scraper: ListingScraper = scrapeListing
): Promise<ListingRefreshResult> {
  const locked = await store.withListingLock(
    listingId,
    async (transaction) => {
      const listing = await transaction.findListing(listingId);
      if (!listing) {
        return { listingId, status: "FAILED" as const };
      }

      const attempt = await transaction.createAttempt({
        retailerListingId: listingId,
        trigger
      });

      try {
        const parsed = await scraper(listing);
        if (
          parsed.price === null ||
          !Number.isFinite(parsed.price) ||
          parsed.price <= 0
        ) {
          throw new InvalidScrapePriceError();
        }

        const totalSize =
          listing.totalSize ??
          parsePackSize(`${parsed.titleRaw} ${parsed.size ?? ""}`)
            .totalSize;
        await transaction.updateListing(listingId, parsed);
        await transaction.createSnapshot({
          retailerListingId: listingId,
          price: parsed.price,
          originalPrice: positiveOrNull(parsed.originalPrice),
          unitPrice: parsed.price / totalSize,
          promotionText: normalizeOptional(parsed.promotionText),
          currency: normalizeOptional(parsed.currency) ?? "SGD",
          isAvailable: parsed.isAvailable
        });
        await transaction.finishAttempt(attempt.id, {
          status: "COMPLETED",
          snapshotStored: true
        });
        return { listingId, status: "COMPLETED" as const };
      } catch (error) {
        const blocked = isBlockedScrape(error);
        console.warn(
          JSON.stringify({
            event: "listing-refresh-failed",
            listingId,
            retailerSlug: listing.retailer.slug,
            status: blocked ? "BLOCKED" : "FAILED",
            error:
              error instanceof Error
                ? error.message
                : "Unknown retailer scrape failure"
          })
        );
        await transaction.finishAttempt(attempt.id, {
          status: blocked ? "BLOCKED" : "FAILED",
          snapshotStored: false,
          errorCategory: blocked ? "BLOCKED" : "SCRAPE_FAILED",
          errorMessage: blocked
            ? "Retailer blocked the public request"
            : "Retailer scrape failed"
        });
        return {
          listingId,
          status: blocked ? ("BLOCKED" as const) : ("FAILED" as const)
        };
      }
    }
  );

  return locked.acquired
    ? (locked.value ?? { listingId, status: "FAILED" })
    : { listingId, status: "ALREADY_LOCKED" };
}

export async function refreshOwnerListings(
  store: SharedListingRefreshStore = prismaSharedListingRefreshStore,
  ownerId: string,
  trackedProductId?: string,
  scraper: ListingScraper = scrapeListing
): Promise<RefreshSummary> {
  const listingIds = unique(
    await store.resolveOwnerListingIds(ownerId, trackedProductId)
  );
  const results: ListingRefreshResult[] = [];

  for (const listingId of listingIds) {
    results.push(
      await refreshRetailerListing(
        store,
        listingId,
        "MANUAL",
        scraper
      )
    );
  }

  return summarizeRefreshResults(results);
}

export async function runScheduledRefresh(
  store: SharedListingRefreshStore = prismaSharedListingRefreshStore,
  scraper: ListingScraper = scrapeListing
): Promise<RefreshSummary> {
  const results: ListingRefreshResult[] = [];

  for (const listingId of unique(await store.listActiveListingIds())) {
    results.push(
      await refreshRetailerListing(
        store,
        listingId,
        "SCHEDULED",
        scraper
      )
    );
  }

  return summarizeRefreshResults(results);
}

export function summarizeRefreshResults(
  results: ListingRefreshResult[]
): RefreshSummary {
  return {
    total: results.length,
    completed: results.filter((result) => result.status === "COMPLETED")
      .length,
    blocked: results.filter((result) => result.status === "BLOCKED").length,
    failed: results.filter((result) => result.status === "FAILED").length,
    alreadyLocked: results.filter(
      (result) => result.status === "ALREADY_LOCKED"
    ).length
  };
}

async function scrapeListing(
  listing: RefreshListing
): Promise<ParsedRetailerProduct> {
  return scrapeLiveRetailerListing(listing);
}

class InvalidScrapePriceError extends Error {}

function isBlockedScrape(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /\b(?:403|429)\b|captcha|access denied|blocked|bot protection/i.test(
    error.message
  );
}

function positiveOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function getListingRefreshTransactionOptions() {
  return {
    maxWait: 10_000,
    timeout: 120_000
  };
}

type PrismaRefreshClient = PrismaClient | Prisma.TransactionClient;

function createPrismaOperations(
  client: PrismaRefreshClient
): ListingRefreshOperations {
  return {
    findListing(id) {
      return client.retailerListing.findUnique({
        where: { id },
        select: {
          id: true,
          productUrl: true,
          totalSize: true,
          retailer: {
            select: {
              slug: true,
              name: true
            }
          }
        }
      });
    },
    createAttempt(data) {
      return client.scrapeAttempt.create({
        data,
        select: { id: true }
      });
    },
    async updateListing(id, parsed) {
      await client.retailerListing.update({
        where: { id },
        data: {
          retailerSku: normalizeOptional(parsed.retailerSku),
          titleRaw: parsed.titleRaw,
          brandRaw: normalizeOptional(parsed.brandRaw),
          imageUrl: normalizeOptional(parsed.imageUrl)
        }
      });
    },
    async createSnapshot(data) {
      await client.priceSnapshot.create({ data });
    },
    async finishAttempt(id, data) {
      await client.scrapeAttempt.update({
        where: { id },
        data: {
          ...data,
          completedAt: new Date()
        }
      });
    }
  };
}

const prismaSharedListingRefreshStore: SharedListingRefreshStore = {
  ...createPrismaOperations(prisma),
  withListingLock(listingId, operation) {
    return prisma.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw<
          Array<{ locked: boolean }>
        >`
          SELECT pg_try_advisory_xact_lock(
            hashtextextended(${listingId}, 0)
          ) AS locked
        `;
        if (!rows[0]?.locked) {
          return { acquired: false };
        }

        return {
          acquired: true,
          value: await operation(createPrismaOperations(transaction))
        };
      },
      getListingRefreshTransactionOptions()
    );
  },
  async resolveOwnerListingIds(ownerId, trackedProductId) {
    const rows = await prisma.trackedProductListing.findMany({
      where: {
        trackedProduct: {
          ownerId,
          isActive: true,
          ...(trackedProductId ? { id: trackedProductId } : {})
        }
      },
      select: { retailerListingId: true }
    });
    return rows.map((row) => row.retailerListingId);
  },
  async listActiveListingIds() {
    const rows = await prisma.retailerListing.findMany({
      where: {
        trackedProductListings: {
          some: {
            trackedProduct: { isActive: true }
          }
        }
      },
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }
};
