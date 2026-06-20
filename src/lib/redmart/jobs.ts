import {
  Prisma,
  type PrismaClient,
  type RedMartRefreshStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  createPrismaOperations,
  getListingRefreshTransactionOptions,
  storeParsedListingResult,
  type ListingRefreshOperations,
  type RefreshListing,
} from "@/lib/pricing/refresh-prices";
import type { ParsedRetailerProduct } from "@/lib/scraping/product-page-types";

export type QueueCandidate = {
  listingId: string;
  productUrl: string;
  retailerSlug: string;
};

export type QueuedRedMartJob = {
  id: string;
  listingId: string;
  requestedById: string;
  status: RedMartRefreshStatus;
};

export type QueueSummary = {
  created: number;
  alreadyActive: number;
  skipped: number;
  jobs: QueuedRedMartJob[];
};

export type ClaimedRedMartJob = {
  id: string;
  listingId: string;
  productUrl: string;
  expectedItemId: string;
  expectedSkuId: string;
  leaseExpiresAt: Date;
};

export type RedMartAdminJob = {
  id: string;
  listingId: string;
  productTitle: string;
  productUrl: string;
  requesterEmail: string;
  status: RedMartRefreshStatus;
  attemptCount: number;
  failureCategory: string | null;
  failureMessage: string | null;
  createdAt: Date;
  claimedAt: Date | null;
  completedAt: Date | null;
};

export type RedMartJobStore = {
  resolveOwnerListings(
    ownerId: string,
    trackedProductId?: string,
  ): Promise<QueueCandidate[]>;
  resolveAllListings(): Promise<QueueCandidate[]>;
  createPending(
    candidate: QueueCandidate,
    requestedById: string,
  ): Promise<QueuedRedMartJob | "ACTIVE">;
  retryFailed(
    jobId: string,
    requestedById: string,
  ): Promise<QueuedRedMartJob>;
  claim(
    now: Date,
    limit: number,
    leaseExpiresAt: Date,
  ): Promise<ClaimedRedMartJob[]>;
  list(limit: number): Promise<RedMartAdminJob[]>;
};

type ProcessingJob = {
  id: string;
  status: RedMartRefreshStatus;
  leaseExpiresAt: Date | null;
  listing: RefreshListing;
};

export type RedMartJobFailure = {
  category:
    | "BLOCKED"
    | "TIMEOUT"
    | "INVALID_RESPONSE"
    | "IDENTITY_MISMATCH"
    | "UNAVAILABLE"
    | "INTERNAL";
  message: string;
};

export type RedMartJobTransaction = ListingRefreshOperations & {
  getJob(jobId: string): Promise<ProcessingJob | null>;
  completeJob(jobId: string, completedAt: Date): Promise<void>;
  failJob(
    jobId: string,
    failure: RedMartJobFailure & { completedAt: Date },
  ): Promise<void>;
};

export type RedMartResultStore = {
  withJobTransaction<T>(
    jobId: string,
    operation: (transaction: RedMartJobTransaction) => Promise<T>,
  ): Promise<T>;
};

export async function queueOwnerRedMartRefreshes(
  store: RedMartJobStore = prismaRedMartJobStore,
  ownerId: string,
  requestedById: string,
  trackedProductId?: string,
) {
  return queueCandidates(
    store,
    await store.resolveOwnerListings(ownerId, trackedProductId),
    requestedById,
  );
}

export async function queueAllRedMartRefreshes(
  store: RedMartJobStore = prismaRedMartJobStore,
  requestedById: string,
) {
  return queueCandidates(
    store,
    await store.resolveAllListings(),
    requestedById,
  );
}

export function retryRedMartRefresh(
  store: RedMartJobStore = prismaRedMartJobStore,
  jobId: string,
  requestedById: string,
) {
  return store.retryFailed(jobId, requestedById);
}

export function claimRedMartJobs(
  store: RedMartJobStore = prismaRedMartJobStore,
  now = new Date(),
  requestedLimit = 10,
) {
  const limit = Math.max(1, Math.min(10, requestedLimit));
  const leaseExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  return store.claim(now, limit, leaseExpiresAt);
}

export function listRedMartRefreshJobs(
  store: RedMartJobStore = prismaRedMartJobStore,
  requestedLimit = 100,
) {
  return store.list(Math.max(1, Math.min(100, requestedLimit)));
}

export async function completeRedMartJob(
  store: RedMartResultStore = prismaRedMartResultStore,
  jobId: string,
  parsed: ParsedRetailerProduct,
  now = new Date(),
) {
  const outcome = await store.withJobTransaction(jobId, async (transaction) => {
    const job = await requireProcessingJob(transaction, jobId, now);
    const expected = getRedMartIdentity(job.listing.productUrl);
    const actual = getRedMartIdentity(parsed.productUrl);
    if (
      !expected ||
      !actual ||
      expected.itemId !== actual.itemId ||
      expected.skuId !== actual.skuId ||
      parsed.retailerSku !== expected.skuId
    ) {
      const failure = sanitizeFailure({
        category: "IDENTITY_MISMATCH",
        message: "Collector result did not match the claimed RedMart listing",
      });
      await transaction.failJob(jobId, { ...failure, completedAt: now });
      return { error: "IDENTITY_MISMATCH" as const };
    }

    const attempt = await transaction.createAttempt({
      retailerListingId: job.listing.id,
      trigger: "MANUAL",
    });
    await storeParsedListingResult(transaction, job.listing, parsed);
    await transaction.finishAttempt(attempt.id, {
      status: "COMPLETED",
      snapshotStored: true,
    });
    await transaction.completeJob(jobId, now);
    return { error: null };
  });

  if (outcome.error) {
    throw new RedMartResultError(outcome.error);
  }
}

export async function failRedMartJob(
  store: RedMartResultStore = prismaRedMartResultStore,
  jobId: string,
  failure: RedMartJobFailure,
  now = new Date(),
) {
  const sanitized = sanitizeFailure(failure);
  await store.withJobTransaction(jobId, async (transaction) => {
    const job = await requireProcessingJob(transaction, jobId, now);
    const attempt = await transaction.createAttempt({
      retailerListingId: job.listing.id,
      trigger: "MANUAL",
    });
    await transaction.finishAttempt(attempt.id, {
      status: sanitized.category === "BLOCKED" ? "BLOCKED" : "FAILED",
      snapshotStored: false,
      errorCategory: sanitized.category,
      errorMessage: sanitized.message,
    });
    await transaction.failJob(jobId, { ...sanitized, completedAt: now });
  });
}

async function queueCandidates(
  store: RedMartJobStore,
  candidates: QueueCandidate[],
  requestedById: string,
): Promise<QueueSummary> {
  const jobs: QueuedRedMartJob[] = [];
  let alreadyActive = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    if (candidate.retailerSlug !== "redmart") {
      skipped += 1;
      continue;
    }
    const created = await store.createPending(candidate, requestedById);
    if (created === "ACTIVE") {
      alreadyActive += 1;
    } else {
      jobs.push(created);
    }
  }

  return { created: jobs.length, alreadyActive, skipped, jobs };
}

function getRedMartIdentity(productUrl: string) {
  const match = productUrl.match(/\/pdp-i(\d+)-s(\d+)\.html/i);
  return match?.[1] && match[2]
    ? { itemId: match[1], skuId: match[2] }
    : null;
}

async function requireProcessingJob(
  transaction: RedMartJobTransaction,
  jobId: string,
  now: Date,
) {
  const job = await transaction.getJob(jobId);
  if (
    !job ||
    job.status !== "PROCESSING" ||
    !job.leaseExpiresAt ||
    job.leaseExpiresAt < now
  ) {
    throw new RedMartResultError("JOB_NOT_PROCESSING");
  }
  return job;
}

function sanitizeFailure(failure: RedMartJobFailure): RedMartJobFailure {
  return {
    category: failure.category,
    message:
      failure.message.trim().replace(/\s+/g, " ").slice(0, 300) ||
      "RedMart collection failed",
  };
}

const jobSelection = {
  id: true,
  listingId: true,
  requestedById: true,
  status: true,
} satisfies Prisma.RedMartRefreshJobSelect;

const prismaRedMartJobStore: RedMartJobStore = {
  async resolveOwnerListings(ownerId, trackedProductId) {
    const rows = await prisma.retailerListing.findMany({
      where: {
        trackedProductListings: {
          some: {
            trackedProduct: {
              ownerId,
              isActive: true,
              ...(trackedProductId ? { id: trackedProductId } : {}),
            },
          },
        },
      },
      select: {
        id: true,
        productUrl: true,
        retailer: { select: { slug: true } },
      },
    });
    return rows.map((row) => ({
      listingId: row.id,
      productUrl: row.productUrl,
      retailerSlug: row.retailer.slug,
    }));
  },
  async resolveAllListings() {
    const rows = await prisma.retailerListing.findMany({
      where: {
        retailer: { slug: "redmart" },
        trackedProductListings: {
          some: { trackedProduct: { isActive: true } },
        },
      },
      select: {
        id: true,
        productUrl: true,
        retailer: { select: { slug: true } },
      },
    });
    return rows.map((row) => ({
      listingId: row.id,
      productUrl: row.productUrl,
      retailerSlug: row.retailer.slug,
    }));
  },
  async createPending(candidate, requestedById) {
    try {
      return await prisma.redMartRefreshJob.create({
        data: {
          listingId: candidate.listingId,
          requestedById,
          activeKey: candidate.listingId,
        },
        select: jobSelection,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return "ACTIVE";
      }
      throw error;
    }
  },
  async retryFailed(jobId, requestedById) {
    const failed = await prisma.redMartRefreshJob.findUnique({
      where: { id: jobId },
      select: { listingId: true, status: true },
    });
    if (!failed || failed.status !== "FAILED") {
      throw new RedMartJobError("JOB_NOT_RETRYABLE");
    }
    return prisma.redMartRefreshJob.create({
      data: {
        listingId: failed.listingId,
        requestedById,
        activeKey: failed.listingId,
      },
      select: jobSelection,
    });
  },
  claim(now, limit, leaseExpiresAt) {
    return prisma.$transaction(async (transaction) => {
      const selected = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "RedMartRefreshJob"
        WHERE "status" = 'PENDING'::"RedMartRefreshStatus"
           OR (
             "status" = 'PROCESSING'::"RedMartRefreshStatus"
             AND "leaseExpiresAt" < ${now}
           )
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `;
      if (selected.length === 0) {
        return [];
      }
      const ids = selected.map(({ id }) => id);
      await transaction.redMartRefreshJob.updateMany({
        where: { id: { in: ids } },
        data: {
          status: "PROCESSING",
          claimedAt: now,
          leaseExpiresAt,
          attemptCount: { increment: 1 },
          failureCategory: null,
          failureMessage: null,
        },
      });
      const jobs = await transaction.redMartRefreshJob.findMany({
        where: { id: { in: ids } },
        include: { listing: { select: { productUrl: true } } },
        orderBy: { createdAt: "asc" },
      });
      return jobs.flatMap((job) => {
        const identity = getRedMartIdentity(job.listing.productUrl);
        return identity
          ? [{
              id: job.id,
              listingId: job.listingId,
              productUrl: job.listing.productUrl,
              expectedItemId: identity.itemId,
              expectedSkuId: identity.skuId,
              leaseExpiresAt,
            }]
          : [];
      });
    });
  },
  async list(limit) {
    const rows = await prisma.redMartRefreshJob.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        requestedBy: { select: { email: true } },
        listing: {
          select: {
            titleRaw: true,
            productUrl: true,
            trackedProductListings: {
              take: 1,
              select: { trackedProduct: { select: { name: true } } },
            },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      productTitle:
        row.listing.trackedProductListings[0]?.trackedProduct.name ??
        row.listing.titleRaw,
      productUrl: row.listing.productUrl,
      requesterEmail: row.requestedBy.email,
      status: row.status,
      attemptCount: row.attemptCount,
      failureCategory: row.failureCategory,
      failureMessage: row.failureMessage,
      createdAt: row.createdAt,
      claimedAt: row.claimedAt,
      completedAt: row.completedAt,
    }));
  },
};

export class RedMartJobError extends Error {
  constructor(readonly code: "JOB_NOT_RETRYABLE") {
    super(code);
    this.name = "RedMartJobError";
  }
}

export class RedMartResultError extends Error {
  constructor(
    readonly code: "IDENTITY_MISMATCH" | "JOB_NOT_PROCESSING",
  ) {
    super(code);
    this.name = "RedMartResultError";
  }
}

type PrismaResultClient = PrismaClient | Prisma.TransactionClient;

function createResultTransaction(
  client: PrismaResultClient,
): RedMartJobTransaction {
  return {
    ...createPrismaOperations(client),
    getJob(jobId) {
      return client.redMartRefreshJob.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          status: true,
          leaseExpiresAt: true,
          listing: {
            select: {
              id: true,
              productUrl: true,
              totalSize: true,
              retailer: { select: { slug: true, name: true } },
            },
          },
        },
      });
    },
    async completeJob(jobId, completedAt) {
      await client.redMartRefreshJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          activeKey: null,
          completedAt,
          leaseExpiresAt: null,
          failureCategory: null,
          failureMessage: null,
        },
      });
    },
    async failJob(jobId, failure) {
      await client.redMartRefreshJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          activeKey: null,
          completedAt: failure.completedAt,
          leaseExpiresAt: null,
          failureCategory: failure.category,
          failureMessage: failure.message,
        },
      });
    },
  };
}

const prismaRedMartResultStore: RedMartResultStore = {
  withJobTransaction(_jobId, operation) {
    return prisma.$transaction(
      (transaction) => operation(createResultTransaction(transaction)),
      getListingRefreshTransactionOptions(),
    );
  },
};
