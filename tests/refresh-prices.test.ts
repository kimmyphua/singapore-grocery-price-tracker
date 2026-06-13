import { describe, expect, it } from "vitest";
import {
  summarizeRefreshResults,
  type ListingRefreshResult
} from "@/lib/pricing/refresh-prices";

describe("refresh result summaries", () => {
  it("counts every terminal listing result", () => {
    const results: ListingRefreshResult[] = [
      { listingId: "1", status: "COMPLETED" },
      { listingId: "2", status: "BLOCKED" },
      { listingId: "3", status: "FAILED" },
      { listingId: "4", status: "ALREADY_LOCKED" }
    ];

    expect(summarizeRefreshResults(results)).toEqual({
      total: 4,
      completed: 1,
      blocked: 1,
      failed: 1,
      alreadyLocked: 1
    });
  });
});
