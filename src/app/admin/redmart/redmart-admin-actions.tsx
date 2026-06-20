"use client";

import { useState } from "react";

export function RedMartAdminActions({
  retryJobId,
}: {
  retryJobId?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function submit() {
    setState("loading");
    try {
      const response = await fetch("/api/admin/redmart/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          retryJobId
            ? { action: "retry", jobId: retryJobId }
            : { action: "queue-all" },
        ),
      });
      if (!response.ok) throw new Error("Request failed");
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={submit}
        disabled={state === "loading"}
        className="rounded-full bg-peach px-4 py-2 text-sm font-bold text-ink disabled:cursor-wait disabled:opacity-60"
      >
        {state === "loading"
          ? "Queueing..."
          : retryJobId
            ? "Retry"
            : "Queue all tracked RedMart"}
      </button>
      {state === "error" ? (
        <p className="text-xs text-berry">Request failed. Try again.</p>
      ) : null}
    </div>
  );
}
