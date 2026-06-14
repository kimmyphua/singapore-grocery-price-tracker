"use client";

import React, { useState } from "react";
import Link from "next/link";

export function ProductActions({
  productId,
  productSlug
}: {
  productId: string;
  productSlug: string;
}) {
  const [state, setState] = useState<"idle" | "deleting" | "deleted" | "error">(
    "idle"
  );

  async function deleteProduct() {
    if (!window.confirm("Delete this tracked product? Saved retailer prices will remain available to other users.")) {
      return;
    }

    setState("deleting");
    const response = await fetch(`/api/products/${productId}`, {
      method: "DELETE"
    });
    setState(response.ok ? "deleted" : "error");
  }

  if (state === "deleted") {
    return (
      <Link href="/products" className="text-sm font-bold text-ink">
        Product deleted. Return to products.
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href={`/products/${productSlug}/edit`}
        className="inline-flex rounded-full border border-lilac px-4 py-2 text-sm font-bold text-ink"
      >
        Add retailer URL
      </Link>
      <button
        type="button"
        onClick={deleteProduct}
        disabled={state === "deleting"}
        className="rounded-full border border-peach px-4 py-2 text-sm font-bold text-ink disabled:opacity-60"
      >
        {state === "deleting" ? "Deleting..." : "Delete product"}
      </button>
      {state === "error" ? (
        <span className="text-sm font-semibold text-ink">
          Delete failed. Try again.
        </span>
      ) : null}
    </div>
  );
}
