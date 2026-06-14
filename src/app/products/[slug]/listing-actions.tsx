"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

export function ListingActions({
  productId,
  retailerId,
  retailerName
}: {
  productId: string;
  retailerId: string;
  retailerName: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "removing" | "error">("idle");

  async function removeListing() {
    if (!window.confirm(`Remove the ${retailerName} URL from this product?`)) {
      return;
    }

    setState("removing");
    const response = await fetch(`/api/products/${productId}/listings`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ retailerId })
    });

    if (!response.ok) {
      setState("error");
      return;
    }

    router.refresh();
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={removeListing}
        disabled={state === "removing"}
        className="text-xs font-semibold text-peach transition hover:text-ink disabled:opacity-60"
      >
        {state === "removing" ? "Removing..." : `Remove ${retailerName} URL`}
      </button>
      {state === "error" ? (
        <p className="mt-1 text-xs font-semibold text-peach">
          Remove failed. Try again.
        </p>
      ) : null}
    </div>
  );
}
