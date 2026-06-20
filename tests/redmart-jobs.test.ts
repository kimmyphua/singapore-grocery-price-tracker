import { describe, expect, it, vi } from "vitest";
import {
  claimRedMartJobs,
  completeRedMartJob,
  failRedMartJob,
  queueOwnerRedMartRefreshes,
  type ClaimedRedMartJob,
  type QueueCandidate,
  type QueuedRedMartJob,
  type RedMartJobStore,
  type RedMartJobTransaction,
  type RedMartResultStore,
} from "@/lib/redmart/jobs";
import type { ParsedRetailerProduct } from "@/lib/scraping/product-page-types";

const redMartCandidate: QueueCandidate = {
  listingId: "listing-redmart",
  productUrl:
    "https://www.lazada.sg/products/pdp-i2896336114-s20072727483.html",
  retailerSlug: "redmart",
};

function createStore(
  overrides: Partial<RedMartJobStore> = {},
): RedMartJobStore {
  return {
    async resolveOwnerListings(ownerId, trackedProductId) {
      return ownerId === "owner-1" &&
        (!trackedProductId || trackedProductId === "product-1")
        ? [
            redMartCandidate,
            {
              listingId: "listing-fairprice",
              productUrl: "https://www.fairprice.com.sg/product/1",
              retailerSlug: "fairprice",
            },
          ]
        : [];
    },
    async resolveAllListings() {
      return [redMartCandidate];
    },
    async createPending(candidate, requestedById) {
      return {
        id: "job-1",
        listingId: candidate.listingId,
        requestedById,
        status: "PENDING",
      } satisfies QueuedRedMartJob;
    },
    async retryFailed() {
      throw new Error("not used");
    },
    async claim() {
      return [];
    },
    async list() {
      return [];
    },
    ...overrides,
  };
}

describe("RedMart refresh jobs", () => {
  it("queues only an owner's RedMart listing", async () => {
    await expect(
      queueOwnerRedMartRefreshes(
        createStore(),
        "owner-1",
        "profile-1",
        "product-1",
      ),
    ).resolves.toEqual({
      created: 1,
      alreadyActive: 0,
      skipped: 1,
      jobs: [
        {
          id: "job-1",
          listingId: "listing-redmart",
          requestedById: "profile-1",
          status: "PENDING",
        },
      ],
    });
  });

  it("does not queue another user's product", async () => {
    await expect(
      queueOwnerRedMartRefreshes(
        createStore(),
        "owner-2",
        "profile-2",
        "product-1",
      ),
    ).resolves.toMatchObject({ created: 0, jobs: [] });
  });

  it("returns an existing active job instead of duplicating it", async () => {
    const store = createStore({
      async createPending() {
        return "ACTIVE";
      },
    });

    await expect(
      queueOwnerRedMartRefreshes(store, "owner-1", "profile-1"),
    ).resolves.toMatchObject({ created: 0, alreadyActive: 1 });
  });

  it("caps claims at ten and sets a fifteen-minute lease", async () => {
    const claimed: ClaimedRedMartJob[] = [];
    const claim = vi.fn(async () => claimed);
    const now = new Date("2026-06-20T00:00:00.000Z");

    await claimRedMartJobs(createStore({ claim }), now, 50);

    expect(claim).toHaveBeenCalledWith(
      now,
      10,
      new Date("2026-06-20T00:15:00.000Z"),
    );
  });

  it("stores an identity-matched result and completes the job atomically", async () => {
    const snapshots: unknown[] = [];
    const completions: unknown[] = [];
    const { store } = createResultStore({ snapshots, completions });

    await completeRedMartJob(
      store,
      "job-1",
      parsedRedMartResult,
      new Date("2026-06-20T00:05:00.000Z"),
    );

    expect(snapshots).toHaveLength(1);
    expect(completions).toContainEqual({
      jobId: "job-1",
      status: "COMPLETED",
    });
  });

  it("rejects a mismatched SKU before storing a snapshot", async () => {
    const snapshots: unknown[] = [];
    const { store } = createResultStore({ snapshots, completions: [] });

    await expect(
      completeRedMartJob(store, "job-1", {
        ...parsedRedMartResult,
        retailerSku: "different-sku",
      }, new Date("2026-06-20T00:05:00.000Z")),
    ).rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
    expect(snapshots).toHaveLength(0);
  });

  it("sanitizes a recorded collector failure", async () => {
    const failures: unknown[] = [];
    const { store } = createResultStore({
      snapshots: [],
      completions: [],
      failures,
    });

    await failRedMartJob(store, "job-1", {
      category: "BLOCKED",
      message: `blocked\n${"secret".repeat(100)}`,
    }, new Date("2026-06-20T00:05:00.000Z"));

    expect(failures).toEqual([
      expect.objectContaining({
        category: "BLOCKED",
        message: expect.not.stringContaining("\n"),
      }),
    ]);
    expect((failures[0] as { message: string }).message.length).toBeLessThanOrEqual(
      300,
    );
  });
});

const parsedRedMartResult: ParsedRetailerProduct = {
  retailerSlug: "redmart",
  titleRaw: "Haagen-Dazs Pistachio And Cream Ice Cream 420ML",
  price: 14.78,
  originalPrice: null,
  productUrl:
    "https://www.lazada.sg/products/pdp-i2896336114-s20072727483.html",
  isAvailable: true,
  retailerSku: "20072727483",
  currency: "SGD",
  size: "420 ml",
};

function createResultStore({
  snapshots,
  completions,
  failures = [],
}: {
  snapshots: unknown[];
  completions: unknown[];
  failures?: unknown[];
}) {
  const transaction: RedMartJobTransaction = {
    async findListing() {
      return {
        id: "listing-redmart",
        productUrl: redMartCandidate.productUrl,
        totalSize: 420,
        retailer: { slug: "redmart", name: "RedMart" },
      };
    },
    async getJob() {
      return {
        id: "job-1",
        status: "PROCESSING",
        leaseExpiresAt: new Date("2026-06-20T00:15:00.000Z"),
        listing: {
          id: "listing-redmart",
          productUrl: redMartCandidate.productUrl,
          totalSize: 420,
          retailer: { slug: "redmart", name: "RedMart" },
        },
      };
    },
    async createAttempt() {
      return { id: "attempt-1" };
    },
    async updateListing() {},
    async createSnapshot(data) {
      snapshots.push(data);
    },
    async finishAttempt() {},
    async completeJob(jobId) {
      completions.push({ jobId, status: "COMPLETED" });
    },
    async failJob(jobId, failure) {
      failures.push({ jobId, ...failure });
    },
  };
  const store: RedMartResultStore = {
    async withJobTransaction(_jobId, operation) {
      return operation(transaction);
    },
  };
  return { store, transaction };
}
