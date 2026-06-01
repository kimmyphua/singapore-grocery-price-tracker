import { products, retailers } from "@/lib/data/seed-data";
import type { LatestPrice } from "@/lib/data/seed-data";
import { getCachedLatestPrices } from "@/lib/pricing/cached-prices";
import { RefreshButton } from "./refresh-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const latestPrices = await getCachedLatestPrices();
  const comparablePrices = latestPrices.filter((price) => price.effectiveUnitPrice !== null);
  const trackedProducts = products.length;
  const productsWithPrices = new Set(comparablePrices.map((price) => price.productSlug)).size;
  const latestByProduct = products.map((product) => {
    const prices = comparablePrices.filter((price) => price.productSlug === product.slug);
    const cheapest = [...prices].sort(
      (a, b) => (a.effectiveUnitPrice ?? Infinity) - (b.effectiveUnitPrice ?? Infinity)
    )[0];
    return { product, cheapest, prices };
  });
  const lastUpdated = getLastUpdated(comparablePrices);

  return (
    <div className="space-y-7">
      <section className="grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-teal/10 sm:p-6">
          <p className="text-sm font-semibold text-teal">Singapore supermarket prices</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-normal text-ink sm:text-4xl">
            Find the best value in your regular basket
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Compare saved prices from FairPrice, Cold Storage, and RedMart.
            Promotions and out-of-stock prices are included when the supermarket still shows a price.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
            <RefreshButton />
            <a
              href="/products"
              className="inline-flex h-10 items-center justify-center rounded-md border border-teal/30 px-4 text-center text-sm font-semibold text-teal transition hover:bg-teal/10"
            >
              Browse products
            </a>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Tracked products" value={trackedProducts.toString()} />
          <Metric label="Retailers" value={retailers.length.toString()} />
          <Metric label="Products with prices" value={productsWithPrices.toString()} />
          <Metric label="Last updated" value={lastUpdated} />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">Best deals now</h2>
          <p className="mt-1 text-sm text-slate-600">
            Prices shown are saved from the last update. Refresh prices when you want the latest supermarket data.
          </p>
        </div>

        <div className="grid gap-3 md:hidden">
          {latestByProduct.map(({ product, cheapest, prices }) => (
            <a
              key={product.slug}
              href={`/products/${product.slug}`}
              className="rounded-lg border border-teal/15 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">
                    {product.brand} {product.flavour ?? product.family}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">{product.pack}</p>
                </div>
                <StatusBadge hasPrice={Boolean(cheapest)} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <InfoBlock label="Best retailer" value={cheapest?.retailerName ?? "No price yet"} />
                <InfoBlock value={formatOriginalPrice(cheapest)} label="Original price" />
                <InfoBlock
                  label="Best value"
                  value={cheapest ? formatBestValue(cheapest) : "-"}
                  wide
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {prices.length > 0 ? `${prices.length} retailer prices saved` : "Refresh to add prices"}
              </p>
            </a>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-lg border border-teal/15 bg-white shadow-sm md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-meadow/25 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Best retailer</th>
                <th className="px-4 py-3 font-semibold">Original price</th>
                <th className="px-4 py-3 font-semibold">Best value</th>
                <th className="px-4 py-3 font-semibold">Price status</th>
              </tr>
            </thead>
            <tbody>
              {latestByProduct.map(({ product, cheapest }) => (
                <tr key={product.slug} className="border-t border-teal/10">
                  <td className="px-4 py-3">
                    <a href={`/products/${product.slug}`} className="font-semibold text-ink">
                      {product.brand} {product.flavour ?? product.family}
                    </a>
                    <div className="text-xs text-slate-500">{product.pack}</div>
                  </td>
                  <td className="px-4 py-3">{cheapest?.retailerName ?? "No price yet"}</td>
                  <td className="px-4 py-3">{formatOriginalPrice(cheapest)}</td>
                  <td className="px-4 py-3">{cheapest ? formatBestValue(cheapest) : "-"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge hasPrice={Boolean(cheapest)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatBestValue(price: {
  effectivePrice: number | null;
  effectiveUnitPrice: number | null;
  dealQuantity: number;
}) {
  if (price.effectivePrice === null || price.effectiveUnitPrice === null) {
    return "-";
  }

  const deal =
    price.dealQuantity > 1
      ? `$${price.effectivePrice.toFixed(2)} each if buying ${price.dealQuantity}`
      : `$${price.effectivePrice.toFixed(2)} each`;

  return `${deal} · $${price.effectiveUnitPrice.toFixed(4)}/unit`;
}

function formatOriginalPrice(price: LatestPrice | undefined) {
  const originalPrice = price?.originalPrice ?? price?.price;
  return originalPrice !== null && originalPrice !== undefined ? `$${originalPrice.toFixed(2)}` : "-";
}

function getLastUpdated(prices: LatestPrice[]) {
  const latest = prices
    .map((price) => new Date(price.capturedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  if (!latest) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(latest);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-teal/15 bg-white p-4 shadow-sm">
      <div className="text-2xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{label}</div>
    </div>
  );
}

function StatusBadge({ hasPrice }: { hasPrice: boolean }) {
  return (
    <span
      className={
        hasPrice
          ? "inline-flex rounded bg-mint/25 px-2 py-1 text-xs font-semibold text-ink"
          : "inline-flex rounded bg-berry/10 px-2 py-1 text-xs font-semibold text-berry"
      }
    >
      {hasPrice ? "Saved price" : "Needs refresh"}
    </span>
  );
}

function InfoBlock({
  label,
  value,
  wide
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-ink">{value}</div>
    </div>
  );
}
