"use client";

import React, { useState, type FormEvent } from "react";
import type { ProductPreview } from "@/lib/products/preview";

type ProductWizardProps = {
  productId?: string;
};

export function ProductWizard({ productId }: ProductWizardProps) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<ProductPreview | null>(null);
  const [status, setStatus] = useState<
    "idle" | "previewing" | "saving" | "saved"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  async function previewUrl(event: FormEvent) {
    event.preventDefault();
    setStatus("previewing");
    setError(null);

    const response = await fetch("/api/products/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    } & Partial<ProductPreview>;

    if (!response.ok) {
      setStatus("idle");
      setError(getPreviewError(body.error));
      return;
    }

    setPreview(body as ProductPreview);
    setStatus("idle");
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!preview) {
      return;
    }

    setStatus("saving");
    setError(null);
    const endpoint = productId
      ? `/api/products/${productId}/listings`
      : "/api/products";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(preview)
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok) {
      setStatus("idle");
      setError(getSaveError(body.error));
      return;
    }

    setStatus("saved");
  }

  function updatePreview<Key extends keyof ProductPreview>(
    key: Key,
    value: ProductPreview[Key]
  ) {
    setPreview((current) =>
      current ? { ...current, [key]: value } : current
    );
  }

  if (status === "saved") {
    return (
      <div className="rounded-2xl border border-sage bg-sage/30 p-5">
        <p className="font-bold text-ink">
          {productId ? "Retailer added." : "Product saved."}
        </p>
        <a
          href={productId ? "/products" : "/products"}
          className="mt-3 inline-flex rounded-full bg-peach px-4 py-2 text-sm font-bold text-ink"
        >
          View products
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={previewUrl}
        className="rounded-2xl border border-sage bg-white p-5 shadow-sm"
      >
        <label htmlFor="product-url" className="text-sm font-bold text-ink">
          Product URL
        </label>
        <p className="mt-1 text-sm text-slate-600">
          Paste a public FairPrice, Cold Storage, or RedMart product page.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            id="product-url"
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="h-11 flex-1 rounded-xl border border-sage px-3 outline-none focus:ring-4 focus:ring-lilac/50"
            placeholder="https://..."
          />
          <button
            type="submit"
            disabled={status === "previewing"}
            className="h-11 rounded-full bg-peach px-5 text-sm font-bold text-ink transition hover:brightness-95 disabled:opacity-60"
          >
            {status === "previewing" ? "Checking..." : "Preview product"}
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
          <button
            type="submit"
            disabled={status === "saving"}
            className="h-11 rounded-full bg-peach px-5 text-sm font-bold text-ink transition hover:brightness-95 disabled:opacity-60"
          >
            {status === "saving"
              ? "Saving..."
              : productId
                ? "Add retailer"
                : "Save product"}
          </button>
        </form>
      ) : null}
    </div>
  );
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
    return "That URL is not a supported FairPrice, Cold Storage, or RedMart product page.";
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
