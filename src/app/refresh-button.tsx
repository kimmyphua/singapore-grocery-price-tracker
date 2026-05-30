"use client";

import { useState } from "react";

export function RefreshButton({ productSlug }: { productSlug?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function refreshPrices() {
    setState("loading");
    try {
      const response = await fetch("/api/prices/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(productSlug ? { productSlug } : {})
      });

      if (!response.ok) {
        throw new Error("Refresh failed");
      }

      setState("done");
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button
        type="button"
        onClick={refreshPrices}
        disabled={state === "loading"}
        className="inline-flex h-10 items-center justify-center rounded-md bg-teal px-4 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-wait disabled:opacity-70"
      >
        {state === "loading" ? "Refreshing..." : "Refresh prices"}
      </button>
      <p className="max-w-xs text-xs leading-5 text-slate-500">
        {state === "error"
          ? "Refresh failed. Try again in a moment."
          : "Checks supermarket sites and updates saved prices."}
      </p>
    </div>
  );
}
