"use client";

import React, { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProductPreview } from "@/lib/products/preview";
import {
  buildManualRetailerPreview,
  type ExistingProductDetails
} from "@/lib/products/manual-preview";
import { parseProductUrlList } from "@/lib/products/url-list";

type ProductWizardProps = {
  productId?: string;
  productSlug?: string;
  existingProduct?: ExistingProductDetails;
};

export function ProductWizard({
  productId,
  productSlug,
  existingProduct
}: ProductWizardProps) {
  const router = useRouter();
  const [urlList, setUrlList] = useState("");
  const [previews, setPreviews] = useState<ProductPreview[]>([]);
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);
  const [status, setStatus] = useState<
    "idle" | "previewing" | "saving"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [manualEntryCount, setManualEntryCount] = useState(0);

  const preview = previews[0] ?? null;

  async function previewUrls(event: FormEvent) {
    event.preventDefault();
    const urls = parseProductUrlList(urlList);
    if (urls.length === 0) {
      setError("Add at least one product URL.");
      return;
    }

    setStatus("previewing");
    setError(null);
    const nextPreviews: ProductPreview[] = [];
    const nextPendingUrls: string[] = [];
    let nextManualEntryCount = 0;

    for (const url of urls) {
      const response = await fetch("/api/products/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      } & Partial<ProductPreview>;

      if (!response.ok) {
        if (
          body.error &&
          MANUAL_FALLBACK_ERRORS.has(body.error)
        ) {
          if (productId && existingProduct) {
            nextPendingUrls.push(url);
            continue;
          }
          nextPreviews.push(
            buildManualRetailerPreview(url, existingProduct)
          );
          nextManualEntryCount += 1;
          continue;
        }
        setStatus("idle");
        setError(getPreviewError(body.error));
        return;
      }
      nextPreviews.push(body as ProductPreview);
    }

    setPreviews(nextPreviews);
    setPendingUrls(nextPendingUrls);
    setManualEntryCount(nextManualEntryCount);
    setStatus("idle");
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (previews.length === 0 && pendingUrls.length === 0) {
      return;
    }

    setStatus("saving");
    setError(null);
    let destinationProductId = productId;
    let destinationProductSlug = productSlug;
    let remainingPreviews = previews;

    if (!destinationProductId) {
      const response = await savePreview("/api/products", previews[0]);
      if (!response.ok) {
        setStatus("idle");
        setError(getSaveError(response.error));
        return;
      }
      destinationProductId = response.id;
      destinationProductSlug = response.slug;
      remainingPreviews = previews.slice(1);
    }

    if (!destinationProductId || !destinationProductSlug) {
      setStatus("idle");
      setError("The product was saved without a usable destination.");
      return;
    }

    for (const retailerPreview of remainingPreviews) {
      const response = await savePreview(
        `/api/products/${destinationProductId}/listings`,
        retailerPreview
      );
      if (!response.ok) {
        setStatus("idle");
        setError(getSaveError(response.error));
        return;
      }
    }

    for (const pendingUrl of pendingUrls) {
      const response = await savePendingUrl(
        `/api/products/${destinationProductId}/listings`,
        pendingUrl
      );
      if (!response.ok) {
        setStatus("idle");
        setError(getSaveError(response.error));
        return;
      }
    }

    router.push(`/products/${destinationProductSlug}`);
  }

  function updatePreview<Key extends keyof ProductPreview>(
    key: Key,
    value: ProductPreview[Key]
  ) {
    setPreviews((current) =>
      current.map((item) => ({ ...item, [key]: value }))
    );
  }

  function updateRetailerPreview<Key extends keyof ProductPreview>(
    index: number,
    key: Key,
    value: ProductPreview[Key]
  ) {
    setPreviews((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      )
    );
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={previewUrls}
        className="rounded-2xl border border-sage bg-white p-5 shadow-sm"
      >
        <label htmlFor="product-urls" className="text-sm font-bold text-ink">
          Product URLs
        </label>
        <p className="mt-1 text-sm text-slate-600">
          Paste one public supermarket product page per line.
        </p>
        <div className="mt-3 space-y-3">
          <textarea
            id="product-urls"
            required
            rows={4}
            value={urlList}
            onChange={(event) => setUrlList(event.target.value)}
            className="w-full rounded-xl border border-sage px-3 py-2 outline-none focus:ring-4 focus:ring-lilac/50"
            placeholder={"https://...\nhttps://..."}
          />
          <button
            type="submit"
            disabled={status === "previewing"}
            className="h-11 rounded-full bg-peach px-5 text-sm font-bold text-ink transition hover:brightness-95 disabled:opacity-60"
          >
            {status === "previewing" ? "Checking..." : "Preview products"}
          </button>
        </div>
      </form>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-peach bg-peach/15 p-4 text-sm font-semibold text-ink"
        >
          {error}
        </div>
      ) : null}

      {manualEntryCount > 0 ? (
        <div className="rounded-xl border border-sage bg-sage/20 p-4 text-sm text-ink">
          Automatic extraction was unavailable for {manualEntryCount} URL
          {manualEntryCount === 1 ? "" : "s"}. Fill in the missing details
          below.
        </div>
      ) : null}

      {pendingUrls.length > 0 ? (
        <form
          onSubmit={saveProduct}
          className="space-y-4 rounded-2xl border border-lilac bg-white p-5 shadow-sm"
        >
          <div>
            <p className="text-sm font-bold text-ink">
              Ready for scheduled refresh
            </p>
            <p className="mt-1 text-sm text-slate-600">
              The retailer blocked the live server check. The URL will be
              saved now, and its verified price and promotion will be added by
              the scheduled public-page refresh.
            </p>
            <p className="mt-2 text-sm font-semibold text-teal">
              {pendingUrls.length} retailer URL
              {pendingUrls.length === 1 ? "" : "s"} ready
            </p>
          </div>
          <button
            type="submit"
            disabled={status === "saving"}
            className="h-11 rounded-full bg-peach px-5 text-sm font-bold text-ink transition hover:brightness-95 disabled:opacity-60"
          >
            {status === "saving"
              ? "Saving..."
              : pendingUrls.length === 1
                ? "Add retailer for scheduled refresh"
                : "Add retailers for scheduled refresh"}
          </button>
        </form>
      ) : null}

      {preview ? (
        <form
          onSubmit={saveProduct}
          className="space-y-4 rounded-2xl border border-lilac bg-white p-5 shadow-sm"
        >
          <div>
            <p className="text-sm font-bold text-ink">Confirm product details</p>
            <p className="mt-1 text-sm text-slate-600">
              Check the extracted information before saving.
            </p>
            <p className="mt-2 text-sm font-semibold text-teal">
              {previews.length} retailer URL{previews.length === 1 ? "" : "s"} ready
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Product name"
              value={preview.name}
              onChange={(value) => updatePreview("name", value)}
              wide
            />
            <TextField
              label="Brand"
              value={preview.brand}
              onChange={(value) => updatePreview("brand", value)}
            />
            <TextField
              label="Category"
              value={preview.family}
              onChange={(value) => updatePreview("family", value)}
            />
            <NumberField
              label="Pack count"
              value={preview.packCount}
              onChange={(value) => updatePreview("packCount", value)}
            />
            <NumberField
              label="Unit size"
              value={preview.unitSize}
              onChange={(value) => updatePreview("unitSize", value)}
            />
            <TextField
              label="Unit"
              value={preview.unit}
              onChange={(value) => updatePreview("unit", value)}
            />
            <NumberField
              label="Total size"
              value={preview.totalSize}
              onChange={(value) => updatePreview("totalSize", value)}
            />
          </div>
          <div className="rounded-xl bg-sage/25 p-4 text-sm text-ink">
            Current price: <strong>${preview.price.toFixed(2)}</strong>
          </div>
          {previews.map((retailerPreview, index) =>
            retailerPreview.price > 0 ? null : (
              <NumberField
                key={retailerPreview.canonicalUrl}
                label={
                  previews.length === 1
                    ? "Current price"
                    : `Current price ${index + 1}`
                }
                value={retailerPreview.price}
                onChange={(value) =>
                  updateRetailerPreview(index, "price", value)
                }
              />
            )
          )}
          <button
            type="submit"
            disabled={status === "saving"}
            className="h-11 rounded-full bg-peach px-5 text-sm font-bold text-ink transition hover:brightness-95 disabled:opacity-60"
          >
            {status === "saving"
              ? "Saving..."
              : productId
                ? previews.length === 1
                  ? "Add retailer"
                  : "Add retailers"
                : "Save product"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

const MANUAL_FALLBACK_ERRORS = new Set([
  "FETCH_FAILED",
  "PARSE_FAILED",
  "MISSING_TITLE",
  "MISSING_BRAND",
  "INVALID_PRICE",
  "INVALID_PACK_SIZE"
]);

async function savePreview(endpoint: string, preview: ProductPreview) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(preview)
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    id?: string;
    slug?: string;
  };

  return {
    ok: response.ok,
    error: body.error,
    id: body.id,
    slug: body.slug
  };
}

async function savePendingUrl(endpoint: string, url: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, pending: true })
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };

  return {
    ok: response.ok,
    error: body.error
  };
}

function TextField({
  label,
  value,
  onChange,
  wide = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label
      htmlFor={id}
      className={wide ? "sm:col-span-2" : undefined}
    >
      <span className="text-sm font-bold text-ink">{label}</span>
      <input
        id={id}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-sage px-3 outline-none focus:ring-4 focus:ring-lilac/50"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label htmlFor={id}>
      <span className="text-sm font-bold text-ink">{label}</span>
      <input
        id={id}
        type="number"
        min="0.001"
        step="any"
        required
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-10 w-full rounded-xl border border-sage px-3 outline-none focus:ring-4 focus:ring-lilac/50"
      />
    </label>
  );
}

function getPreviewError(code: string | undefined): string {
  if (code === "UNSUPPORTED_URL") {
    return "That URL is not a supported supermarket product page.";
  }
  if (code === "INVALID_PACK_SIZE") {
    return "The product size could not be read. Try another product URL.";
  }
  if (code === "INVALID_PRICE") {
    return "The page did not contain a usable current price.";
  }
  return "The product page could not be parsed. Check the URL and try again.";
}

function getSaveError(code: string | undefined): string {
  if (code === "PRODUCT_LIMIT_REACHED") {
    return "You can track up to 20 products.";
  }
  if (code === "IDENTITY_MISMATCH") {
    return "This retailer URL appears to be for a different product.";
  }
  if (code === "DUPLICATE_RETAILER") {
    return "This product already has a URL for that retailer.";
  }
  return "The product could not be saved. Check the details and try again.";
}
