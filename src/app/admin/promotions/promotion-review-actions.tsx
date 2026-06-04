"use client";

import { useState } from "react";
import { FullPageLoadingOverlay } from "@/app/full-page-loading-overlay";

type ReviewDeal = {
  id: string;
  rawTitle: string;
  category: "SNACKS" | "ICE_CREAM";
  packText: string | null;
  priceText: string | null;
  parsedPrice: string;
  promoText: string | null;
};

export function PromotionReviewActions({ deal }: { deal: ReviewDeal }) {
  const [form, setForm] = useState(deal);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function save(reviewStatus: "PENDING" | "APPROVED" | "REJECTED") {
    setState("saving");
    try {
      const response = await fetch(`/api/promotions/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rawTitle: form.rawTitle,
          category: form.category,
          packText: form.packText,
          priceText: form.priceText,
          parsedPrice: form.parsedPrice,
          promoText: form.promoText,
          reviewStatus
        })
      });
      if (!response.ok) {
        throw new Error("Save failed");
      }
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {state === "saving" ? <FullPageLoadingOverlay message="Saving promotion review..." /> : null}
      <label className="block">
        <span className="text-xs font-semibold text-slate-500">Title</span>
        <input
          value={form.rawTitle}
          onChange={(event) => setForm({ ...form, rawTitle: event.target.value })}
          className="mt-1 w-full rounded-md border border-teal/20 px-3 py-2 text-sm text-ink"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Category</span>
          <select
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value as ReviewDeal["category"] })}
            className="mt-1 w-full rounded-md border border-teal/20 px-3 py-2 text-sm text-ink"
          >
            <option value="ICE_CREAM">Ice cream</option>
            <option value="SNACKS">Snacks</option>
          </select>
        </label>
        <TextInput
          label="Pack"
          value={form.packText ?? ""}
          onChange={(packText) => setForm({ ...form, packText })}
        />
        <TextInput
          label="Price text"
          value={form.priceText ?? ""}
          onChange={(priceText) => setForm({ ...form, priceText })}
        />
        <TextInput
          label="Parsed price"
          value={form.parsedPrice}
          onChange={(parsedPrice) => setForm({ ...form, parsedPrice })}
        />
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-slate-500">Promotion text</span>
        <textarea
          value={form.promoText ?? ""}
          onChange={(event) => setForm({ ...form, promoText: event.target.value })}
          rows={2}
          className="mt-1 w-full rounded-md border border-teal/20 px-3 py-2 text-sm text-ink"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save("APPROVED")}
          disabled={state === "saving"}
          className="rounded-md bg-teal px-3 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => save("REJECTED")}
          disabled={state === "saving"}
          className="rounded-md border border-berry/30 px-3 py-2 text-sm font-semibold text-berry disabled:cursor-wait disabled:opacity-70"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => save("PENDING")}
          disabled={state === "saving"}
          className="rounded-md border border-teal/20 px-3 py-2 text-sm font-semibold text-teal disabled:cursor-wait disabled:opacity-70"
        >
          Save edits
        </button>
      </div>
      {state === "error" ? <p className="text-xs font-semibold text-berry">Could not save this deal.</p> : null}
    </div>
  );
}

export function BulkApprovePromotionReviews({ pendingCount }: { pendingCount: number }) {
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function approveAll() {
    setState("saving");
    try {
      const response = await fetch("/api/promotions/deals/bulk", { method: "PATCH" });
      if (!response.ok) {
        throw new Error("Bulk approve failed");
      }
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  return (
    <>
      {state === "saving" ? <FullPageLoadingOverlay message="Approving all pending promotions..." /> : null}
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <button
          type="button"
          onClick={approveAll}
          disabled={state === "saving" || pendingCount === 0}
          className="inline-flex h-10 items-center justify-center rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve all pending
        </button>
        <p className="max-w-sm text-xs leading-5 text-slate-500">
          {state === "error"
            ? "Could not approve all promotions. Try again in a moment."
            : `${pendingCount} pending promotion${pendingCount === 1 ? "" : "s"} will move to approved.`}
        </p>
      </div>
    </>
  );
}

function TextInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-teal/20 px-3 py-2 text-sm text-ink"
      />
    </label>
  );
}
