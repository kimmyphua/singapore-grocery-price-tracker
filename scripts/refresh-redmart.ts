import { loadEnvConfig } from "@next/env";
import { parseAuthServerEnv, parseRedMartServerEnv } from "../src/lib/env";
import {
  runRedMartCollector,
  type CollectorSubmission,
} from "../src/lib/redmart/collector";
import type { ClaimedRedMartJob } from "../src/lib/redmart/jobs";
import { scrapeRedMartBrowserProductPage } from "../src/lib/scraping/redmart-browser-page";

loadEnvConfig(process.cwd());

async function main() {
  const { appOrigin } = parseAuthServerEnv(process.env);
  const { collectorToken } = parseRedMartServerEnv(process.env);
  const headers = {
    authorization: `Bearer ${collectorToken}`,
    "content-type": "application/json",
  };

  const summary = await runRedMartCollector({
    async claim() {
      const response = await fetch(
        `${appOrigin}/api/collector/redmart/jobs/claim`,
        { method: "POST", headers, body: "{}" },
      );
      if (!response.ok) {
        throw new Error(`Collector claim failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        jobs: Array<Omit<ClaimedRedMartJob, "leaseExpiresAt"> & { leaseExpiresAt: string }>;
      };
      return payload.jobs.map((job) => ({
        ...job,
        leaseExpiresAt: new Date(job.leaseExpiresAt),
      }));
    },
    scrape(productUrl) {
      return scrapeRedMartBrowserProductPage(productUrl, {
        forceLocalChrome: true,
      });
    },
    async submit(jobId: string, payload: CollectorSubmission) {
      const response = await fetch(
        `${appOrigin}/api/collector/redmart/jobs/${jobId}/result`,
        { method: "POST", headers, body: JSON.stringify(payload) },
      );
      if (!response.ok) {
        throw new Error(`Collector submission failed with HTTP ${response.status}`);
      }
    },
    sleep(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    },
  });

  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : "Collector failed",
    }),
  );
  process.exitCode = 1;
});
