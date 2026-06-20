import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAppSession: vi.fn(),
  requireAdminSession: vi.fn(),
  queueOwner: vi.fn(),
  queueAll: vi.fn(),
  retry: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireAppSession: mocks.requireAppSession,
}));
vi.mock("@/lib/auth/guards", () => ({
  appSessionErrorResponse: () => null,
}));
vi.mock("@/lib/auth/request-security", () => ({
  requireSameOrigin: () => null,
}));
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: mocks.requireAdminSession,
  adminAuthorizationErrorResponse: () => null,
}));
vi.mock("@/lib/env", () => ({
  parseRedMartServerEnv: () => ({
    adminEmails: ["admin@example.com"],
    collectorToken: "a".repeat(64),
  }),
}));
vi.mock("@/lib/redmart/jobs", () => ({
  queueOwnerRedMartRefreshes: mocks.queueOwner,
  queueAllRedMartRefreshes: mocks.queueAll,
  retryRedMartRefresh: mocks.retry,
  claimRedMartJobs: mocks.claim,
  completeRedMartJob: mocks.complete,
  failRedMartJob: mocks.fail,
  RedMartResultError: class RedMartResultError extends Error {},
}));

import { POST as queueUser } from "@/app/api/redmart/refresh/route";
import { POST as queueAdmin } from "@/app/api/admin/redmart/refresh/route";
import { POST as claimCollector } from "@/app/api/collector/redmart/jobs/claim/route";
import { POST as submitCollector } from "@/app/api/collector/redmart/jobs/[id]/result/route";

const session = {
  profileId: "profile-1",
  supabaseUserId: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
};

function jsonRequest(url: string, body: unknown, token?: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("RedMart API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAppSession.mockResolvedValue(session);
    mocks.requireAdminSession.mockResolvedValue(session);
  });

  it("queues an owner-scoped RedMart product", async () => {
    mocks.queueOwner.mockResolvedValue({
      created: 1,
      alreadyActive: 0,
      skipped: 0,
      jobs: [{ id: "job-1", status: "PENDING" }],
    });

    const response = await queueUser(
      jsonRequest("https://prices.example/api/redmart/refresh", {
        trackedProductId: "product-1",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.queueOwner).toHaveBeenCalledWith(
      undefined,
      "profile-1",
      "profile-1",
      "product-1",
    );
  });

  it("allows an admin to queue every tracked RedMart listing", async () => {
    mocks.queueAll.mockResolvedValue({
      created: 3,
      alreadyActive: 1,
      skipped: 0,
      jobs: [],
    });

    const response = await queueAdmin(
      jsonRequest("https://prices.example/api/admin/redmart/refresh", {
        action: "queue-all",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.queueAll).toHaveBeenCalledWith(undefined, "profile-1");
  });

  it("rejects an unauthenticated collector claim", async () => {
    const response = await claimCollector(
      jsonRequest("https://prices.example/api/collector/redmart/jobs/claim", {}),
    );

    expect(response.status).toBe(401);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("claims at most ten jobs for an authorized collector", async () => {
    mocks.claim.mockResolvedValue([{ id: "job-1" }]);
    const response = await claimCollector(
      jsonRequest(
        "https://prices.example/api/collector/redmart/jobs/claim",
        {},
        "a".repeat(64),
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledWith(undefined, expect.any(Date), 10);
  });

  it("accepts a normalized collector result", async () => {
    const result = {
      retailerSlug: "redmart",
      titleRaw: "Haagen-Dazs Pistachio 420ML",
      price: 14.78,
      originalPrice: null,
      productUrl:
        "https://www.lazada.sg/products/pdp-i2896336114-s20072727483.html",
      isAvailable: true,
      retailerSku: "20072727483",
    };
    const response = await submitCollector(
      jsonRequest(
        "https://prices.example/api/collector/redmart/jobs/job-1/result",
        { status: "COMPLETED", result },
        "a".repeat(64),
      ),
      { params: { id: "job-1" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.complete).toHaveBeenCalledWith(
      undefined,
      "job-1",
      expect.objectContaining({ retailerSku: "20072727483" }),
    );
  });
});
