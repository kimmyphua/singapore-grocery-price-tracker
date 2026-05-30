"use client";

import { useState } from "react";

type RefreshState = "idle" | "loading" | "done" | "error";

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
      const result = (await response.json()) as {
        flyersFetched: number;
        duplicatesSkipped: number;
        candidatesCreated: number;
        parseFailures: number;
      };
      setSummary(
        `${result.flyersFetched} flyers imported, ${result.candidatesCreated} review candidates, ${result.duplicatesSkipped} duplicates skipped.`
      );
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
  );
}
