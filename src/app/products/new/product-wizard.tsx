"use client";

import React, { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProductPreview } from "@/lib/products/preview";
import {
  buildManualRetailerPreview,
  type ExistingProductDetails
} from "@/lib/products/manual-preview";

type ProductWizardProps = {
  productId?: string;
  productSlug?: string;
  existingProduct?: ExistingProductDetails;
};

type SavedProduct = {
  id: string;
  slug: string;
  details: ExistingProductDetails;
};

export function ProductWizard({
  productId,
  productSlug,
  existingProduct
}: ProductWizardProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<ProductPreview | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [savedProduct, setSavedProduct] = useState<SavedProduct | null>(null);
  const [status, setStatus] = useState<
    "idle" | "previewing" | "saving"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(false);
  const [identityWarning, setIdentityWarning] = useState(false);
  const [successKind, setSuccessKind] = useState<
    "product" | "retailer" | null
  >(null);

  const destinationProductId = savedProduct?.id ?? productId;
  const destinationProductSlug = savedProduct?.slug ?? productSlug;
  const destinationProductDetails =
    savedProduct?.details ?? existingProduct;

  async function previewUrl(event: FormEvent) {
    event.preventDefault();
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError("Add a product URL.");
      return;
    }

    setStatus("previewing");
    setError(null);
    setIdentityWarning(false);
    setSuccessKind(null);
    setPreview(null);
    setPendingUrl(null);
    setManualEntry(false);

    const response = await fetch("/api/products/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: normalizedUrl })
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    } & Partial<ProductPreview>;

    if (!response.ok) {
      if (body.error && MANUAL_FALLBACK_ERRORS.has(body.error)) {
        const manualPreview = buildManualRetailerPreview(
          normalizedUrl,
          destinationProductDetails
        );
        if (
          destinationProductId &&
          destinationProductDetails &&
          manualPreview.retailerSlug === "redmart"
        ) {
          setPendingUrl(normalizedUrl);
        } else {
          setPreview(manualPreview);
          setManualEntry(true);
        }
      } else {
        setError(getPreviewError(body.error));
      }
      setStatus("idle");
      return;
    }

    setPreview(body as ProductPreview);
    setStatus("idle");
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    await performSave(false);
  }

  async function performSave(allowIdentityMismatch: boolean) {
    if (!preview && !pendingUrl) {
      return;
    }

    setStatus("saving");
    setError(null);
    setIdentityWarning(false);

    if (!destinationProductId) {
      if (!preview) {
        setStatus("idle");
        setError("Product details are required before saving.");
        return;
      }
      const response = await savePreview("/api/products", preview);
      if (!response.ok || !response.id || !response.slug) {
        setStatus("idle");
        setError(getSaveError(response.error));
        return;
      }
      setSavedProduct({
        id: response.id,
        slug: response.slug,
        details: productDetailsFromPreview(preview)
      });
      setSuccessKind("product");
      setStatus("idle");
      return;
    }

    const endpoint = `/api/products/${destinationProductId}/listings`;
    const response = pendingUrl
      ? await savePendingUrl(endpoint, pendingUrl)
      : await savePreview(endpoint, preview!, allowIdentityMismatch);

    if (!response.ok) {
      setStatus("idle");
      if (response.error === "IDENTITY_MISMATCH") {
        setIdentityWarning(true);
      } else {
        setError(getSaveError(response.error));
      }
      return;
    }

    setSuccessKind("retailer");
    setStatus("idle");
  }

  function updatePreview<Key extends keyof ProductPreview>(
    key: Key,
    value: ProductPreview[Key]
  ) {
    setPreview((current) =>
      current ? { ...current, [key]: value } : current
    );
  }

  function addAnotherRetailer() {
    setUrl("");
    setPreview(null);
    setPendingUrl(null);
    setError(null);
    setManualEntry(false);
    setIdentityWarning(false);
    setSuccessKind(null);
  }

  if (successKind && destinationProductSlug) {
    return (
      <section className="space-y-4 rounded-2xl border border-sage bg-sage/20 p-5 shadow-sm">
        <div>
          <p className="font-bold text-ink">
            {successKind === "product" ? "Product saved." : "Retailer added."}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Add another supermarket URL or view the saved product.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={addAnotherRetailer}
            className="rounded-full bg-peach px-5 py-2 text-sm font-bold text-ink"
          >
            Add another retailer
          </button>
          <button
            type="button"
            onClick={() => router.push(`/products/${destinationProductSlug}`)}
            className="rounded-full border border-lilac px-5 py-2 text-sm font-bold text-ink"
          >
            View product
          </button>
        </div>
      </section>
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
          Paste one public supermarket product page.
        </p>
        <div className="mt-3 space-y-3">
          <input
            id="product-url"
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="h-11 w-full rounded-xl border border-sage px-3 outline-none focus:ring-4 focus:ring-lilac/50"
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

      {identityWarning ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-peach bg-peach/15 p-4 text-sm text-ink"
        >
          <p className="font-semibold">
            This retailer item may be named or sized differently from the
            saved product. The original product name and details will be kept.
          </p>
          <button
            type="button"
            disabled={status === "saving"}
            onClick={() => void performSave(true)}
            className="rounded-full bg-peach px-5 py-2 font-bold text-ink disabled:opacity-60"
          >
            {status === "saving" ? "Saving..." : "Add retailer anyway"}
          </button>
        </div>
      ) : null}

      {manualEntry ? (
        <div className="rounded-xl border border-sage bg-sage/20 p-4 text-sm text-ink">
          Automatic extraction was unavailable. Fill in the missing details
          below.
        </div>
      ) : null}

      {pendingUrl ? (
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
          </div>
          <button
            type="submit"
            disabled={status === "saving"}
            className="h-11 rounded-full bg-peach px-5 text-sm font-bold text-ink transition hover:brightness-95 disabled:opacity-60"
          >
            {status === "saving"
              ? "Saving..."
              : "Add retailer for scheduled refresh"}
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
          {preview.price > 0 ? null : (
            <NumberField
              label="Current price"
              value={preview.price}
              onChange={(value) => updatePreview("price", value)}
            />
          )}
          <button
            type="submit"
            disabled={status === "saving" || identityWarning}
            className="h-11 rounded-full bg-peach px-5 text-sm font-bold text-ink transition hover:brightness-95 disabled:opacity-60"
          >
            {status === "saving"
              ? "Saving..."
              : destinationProductId
                ? "Add retailer"
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

async function savePreview(
  endpoint: string,
  preview: ProductPreview,
  allowIdentityMismatch = false
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...preview,
      ...(allowIdentityMismatch ? { allowIdentityMismatch: true } : {})
    })
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

function productDetailsFromPreview(
  preview: ProductPreview
): ExistingProductDetails {
  return {
    name: preview.name,
    brand: preview.brand,
    family: preview.family,
    flavour: preview.flavour,
    packCount: preview.packCount,
    unitSize: preview.unitSize,
    unit: preview.unit,
    totalSize: preview.totalSize,
    imageUrl: preview.imageUrl
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
  if (code === "DUPLICATE_PRODUCT") {
    return "You are already tracking this product. Open it from Products to add another retailer.";
  }
  if (code === "DUPLICATE_RETAILER") {
    return "This product already has a URL for that retailer.";
  }
  return "The product could not be saved. Check the details and try again.";
}
