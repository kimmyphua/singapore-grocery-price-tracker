import { products } from "@/lib/data/seed-data";
import type { LatestPrice } from "@/lib/data/seed-data";
import { getCachedLatestPrices } from "@/lib/pricing/cached-prices";
import { notFound } from "next/navigation";
import { RefreshButton } from "@/app/refresh-button";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = products.find((item) => item.slug === params.slug);
  if (!product) {
    notFound();
  }

  const prices = await getCachedLatestPrices(undefined, { productSlug: product.slug });
  const sortedPrices = [...prices].sort(
    (left, right) =>
      (left.effectiveUnitPrice ?? Infinity) - (right.effectiveUnitPrice ?? Infinity) ||
      statusRank(left.scrapeStatus) - statusRank(right.scrapeStatus)
  );
  const bestPrice = sortedPrices[0];

  return (
    <div className="space-y-6">
      <a href="/products" className="text-sm font-medium text-teal">
        Back to products
      </a>
      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-teal/10">
          <p className="text-sm font-semibold text-teal">{product.family}</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">
            {product.brand} {product.flavour ?? product.family}
          </h1>
          <p className="mt-2 text-slate-600">{product.pack}</p>
        </div>
        <div className="rounded-lg border border-mint/40 bg-mint/15 p-5">
          <p className="text-sm font-semibold text-ink">Best value</p>
          {bestPrice ? (
            <>
              <div className="mt-2 text-2xl font-semibold text-ink">
                {bestPrice.retailerName}
              </div>
              <p className="mt-1 text-sm text-slate-700">{formatBestValue(bestPrice)}</p>
              <p className="mt-3 text-xs text-slate-600">
                Based on saved supermarket prices. Refresh to check for newer deals.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-700">
              No saved prices yet. Refresh this product to add supermarket prices.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-teal/15 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-teal/10 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-ink">Supermarket comparison</h2>
            <p className="mt-1 text-sm text-slate-600">
              Out-of-stock online prices are still shown because store availability can differ by area.
            </p>
          </div>
          <RefreshButton productSlug={product.slug} />
        </div>
        {sortedPrices.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-600">
            No saved prices yet. Refresh this product to check supermarket prices.
          </p>
        ) : (
          <div className="divide-y divide-teal/10">
            {sortedPrices.map((price, index) => (
              <a
                key={`${price.productSlug}-${price.retailerSlug}`}
                href={price.productUrl}
                className="block px-4 py-4 transition hover:bg-meadow/10"
              >
                <div className="grid gap-3 md:grid-cols-[1fr_0.8fr_0.9fr_0.9fr_1.4fr] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{price.retailerName}</span>
                      {index === 0 ? (
                        <span className="rounded bg-mint/30 px-2 py-1 text-xs font-semibold text-ink">
                          Best deal
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{formatStatus(price.scrapeStatus)}</div>
                  </div>
                  <LabeledValue label="Shelf price" value={formatPrice(price.price)} />
                  <LabeledValue
                    label="Deal price"
                    value={
                      price.effectivePrice !== null
                        ? `$${price.effectivePrice.toFixed(2)}${
                            price.dealQuantity > 1 ? ` each x ${price.dealQuantity}` : ""
                          }`
                        : "-"
                    }
                  />
                  <LabeledValue
                    label="Unit value"
                    value={
                      price.effectiveUnitPrice !== null
                        ? `$${price.effectiveUnitPrice.toFixed(4)} per unit`
                        : "-"
                    }
                  />
                  <div className="text-sm text-slate-600">
                    {price.statusMessage ?? price.promotionText ?? "No promo"}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-dashed border-teal/25 bg-white p-4">
        <h2 className="font-semibold text-ink">Price history</h2>
        <p className="mt-2 text-sm text-slate-600">
          Price history will appear here after more saved updates are collected.
        </p>
      </section>
    </div>
  );
}

function statusRank(status: "available" | "unavailable" | "blocked") {
  return { available: 0, unavailable: 1, blocked: 2 }[status];
}

function formatStatus(status: "available" | "unavailable" | "blocked") {
  return {
    available: "Available",
    unavailable: "Unavailable online",
    blocked: "Could not update"
  }[status];
}

function formatBestValue(price: LatestPrice) {
  if (price.effectivePrice === null || price.effectiveUnitPrice === null) {
    return "-";
  }

  const deal =
    price.dealQuantity > 1
      ? `$${price.effectivePrice.toFixed(2)} each if buying ${price.dealQuantity}`
      : `$${price.effectivePrice.toFixed(2)} each`;

  return `${deal} · $${price.effectiveUnitPrice.toFixed(4)}/unit`;
}

function formatPrice(price: number | null) {
  return price !== null ? `$${price.toFixed(2)}` : "-";
}

function LabeledValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 md:hidden">{label}</div>
      <div className="font-medium text-ink">{value}</div>
    </div>
  );
}
