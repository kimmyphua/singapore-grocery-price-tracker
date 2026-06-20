import type { ClaimedRedMartJob, RedMartJobFailure } from "@/lib/redmart/jobs";
import type { ParsedRetailerProduct } from "@/lib/scraping/product-page-types";

export type CollectorSubmission =
  | { status: "COMPLETED"; result: ParsedRetailerProduct }
  | { status: "FAILED"; failure: RedMartJobFailure };

export type CollectorDependencies = {
  claim(): Promise<ClaimedRedMartJob[]>;
  scrape(productUrl: string): Promise<ParsedRetailerProduct>;
  submit(jobId: string, payload: CollectorSubmission): Promise<void>;
  sleep(milliseconds: number): Promise<void>;
};

export type CollectorSummary = {
  claimed: number;
  completed: number;
  failed: number;
};

export async function runRedMartCollector(
  dependencies: CollectorDependencies,
): Promise<CollectorSummary> {
  const jobs = await dependencies.claim();
  let completed = 0;
  let failed = 0;

  for (const [index, job] of jobs.entries()) {
    try {
      const result = await dependencies.scrape(job.productUrl);
      await dependencies.submit(job.id, { status: "COMPLETED", result });
      completed += 1;
    } catch (error) {
      await dependencies.submit(job.id, {
        status: "FAILED",
        failure: classifyCollectorFailure(error),
      });
      failed += 1;
    }

    if (index < jobs.length - 1) {
      await dependencies.sleep(2000);
    }
  }

  return { claimed: jobs.length, completed, failed };
}

export function classifyCollectorFailure(error: unknown): RedMartJobFailure {
  const message = error instanceof Error ? error.message : "Unknown failure";
  if (/\b(?:403|429)\b|captcha|access denied|blocked|bot protection/i.test(message)) {
    return { category: "BLOCKED", message: "Retailer blocked the public page" };
  }
  if (/timeout|timed out/i.test(message)) {
    return { category: "TIMEOUT", message: "Retailer request timed out" };
  }
  if (/unavailable|out of stock/i.test(message)) {
    return { category: "UNAVAILABLE", message: "Retailer product is unavailable" };
  }
  return { category: "INVALID_RESPONSE", message: "Retailer response could not be parsed" };
}
