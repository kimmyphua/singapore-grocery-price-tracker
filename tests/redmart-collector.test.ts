import { describe, expect, it, vi } from "vitest";
import {
  runRedMartCollector,
  type CollectorDependencies,
} from "@/lib/redmart/collector";

const jobs = [
  {
    id: "job-1",
    listingId: "listing-1",
    productUrl:
      "https://www.lazada.sg/products/pdp-i3646271199-s24102891696.html",
    expectedItemId: "3646271199",
    expectedSkuId: "24102891696",
    leaseExpiresAt: new Date("2026-06-20T00:15:00.000Z"),
  },
  {
    id: "job-2",
    listingId: "listing-2",
    productUrl:
      "https://www.lazada.sg/products/pdp-i2896336114-s20072727483.html",
    expectedItemId: "2896336114",
    expectedSkuId: "20072727483",
    leaseExpiresAt: new Date("2026-06-20T00:15:00.000Z"),
  },
];

describe("local RedMart collector", () => {
  it("processes jobs sequentially and continues after one scrape fails", async () => {
    const submit = vi.fn(async () => undefined);
    const sleep = vi.fn(async () => undefined);
    const scrape = vi
      .fn()
      .mockResolvedValueOnce({
        retailerSlug: "redmart",
        titleRaw: "Bulla Cookies & Cream 2L",
        price: 12.96,
        originalPrice: 15.84,
        productUrl: jobs[0].productUrl,
        retailerSku: "24102891696",
        isAvailable: true,
      })
      .mockRejectedValueOnce(new Error("403 blocked"));
    const dependencies: CollectorDependencies = {
      claim: vi.fn(async () => jobs),
      scrape,
      submit,
      sleep,
    };

    await expect(runRedMartCollector(dependencies)).resolves.toEqual({
      claimed: 2,
      completed: 1,
      failed: 1,
    });
    expect(scrape).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(submit).toHaveBeenNthCalledWith(
      2,
      "job-2",
      expect.objectContaining({
        status: "FAILED",
        failure: expect.objectContaining({ category: "BLOCKED" }),
      }),
    );
  });
});
