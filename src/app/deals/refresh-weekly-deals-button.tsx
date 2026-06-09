"use client";

import { useState } from "react";
import { FullPageLoadingOverlay } from "@/app/full-page-loading-overlay";

type RefreshState = "idle" | "loading" | "done" | "error";

type RefreshResult = {
  publicationsDiscovered: number;
  publicationsSkipped: number;
  staleDealsRemoved: number;
  flyersFetched: number;
  candidatesCreated: number;
  parseFailures: number;
  failures: Array<{ seriesKey: string; message: string }>;
};

export function RefreshWeeklyDealsButton() {
  const [state, setState] = useState<RefreshState>("idle");
  const [summary, setSummary] = useState<string | null>(null);

  async function refreshDeals() {
    setState("loading");
    setSummary(null);
    try {
      const response = await fetch("/api/promotions/refresh", { method: "POST" });
      if (!response.ok) {
        throw new Error("Refresh failed");
      }
      const result = (await response.json()) as RefreshResult;
      const resultSummary =
        `${result.staleDealsRemoved} stale deals removed, ${result.flyersFetched} flyer pages imported, ${result.candidatesCreated} review candidates, ${result.publicationsSkipped} unchanged publication${result.publicationsSkipped === 1 ? "" : "s"} skipped.`
      if (result.failures.length > 0 || result.parseFailures > 0) {
        const failureCount = Math.max(
          result.failures.length,
          result.parseFailures
        );
        setSummary(
          `${resultSummary} ${failureCount} flyer${failureCount === 1 ? "" : "s"} failed to refresh; stale deals may have been cleared.`
        );
        setState("error");
        return;
      }
      setSummary(resultSummary);
      setState("done");
      if (result.candidatesCreated > 0) {
        window.location.href = `/admin/promotions?imported=${result.candidatesCreated}`;
      } else {
        window.location.reload();
      }
    } catch {
      setState("error");
      setSummary("Weekly deals refresh failed. Try again in a moment.");
    }
  }

  return (
    <>
      {state === "loading" ? <FullPageLoadingOverlay message="Refreshing weekly flyer deals..." /> : null}
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <button
          type="button"
          onClick={refreshDeals}
          disabled={state === "loading"}
          className="inline-flex h-10 items-center justify-center rounded-md bg-teal px-4 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-wait disabled:opacity-70"
        >
          {state === "loading" ? "Refreshing..." : "Refresh weekly deals"}
        </button>
        <p className="max-w-sm text-xs leading-5 text-slate-500">
          {summary ?? "Fetches supermarket flyers and adds OCR matches to the review queue."}
        </p>
      </div>
    </>
  );
}
