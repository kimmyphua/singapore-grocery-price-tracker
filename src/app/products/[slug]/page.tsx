import { products, retailers } from "@/lib/data/seed-data";
import { requireProtectedPage } from "@/lib/auth/guards";
import type { LatestPrice, PriceHistory, WeeklyPriceHistorySort } from "@/lib/data/seed-data";
import { getCachedLatestPrices, getCachedWeeklyPriceHistory } from "@/lib/pricing/cached-prices";
import { notFound } from "next/navigation";
import { RefreshButton } from "@/app/refresh-button";

export const dynamic = "force-dynamic";

type ProductDetailSearchParams = {
  historyRetailer?: string;
  historyQuery?: string;
  historySort?: string;
  historyDirection?: string;
  historyPage?: string;
};

export default async function ProductDetailPage({
  params,
  searchParams
}: {
  params: { slug: string };
  searchParams?: ProductDetailSearchParams;
}) {
  await requireProtectedPage();
  const product = products.find((item) => item.slug === params.slug);
  if (!product) {
    notFound();
  }

  const historyControls = getHistoryControls(searchParams);
  const [prices, priceHistory] = await Promise.all([
    getCachedLatestPrices(undefined, { productSlug: product.slug }),
    getCachedWeeklyPriceHistory(undefined, {
      productSlug: product.slug,
      retailerSlug: historyControls.retailerSlug,
      query: historyControls.query,
      sort: historyControls.sort,
      direction: historyControls.direction,
      page: historyControls.page,
      pageSize: historyControls.pageSize
    })
  ]);
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
                target="_blank"
                rel="noreferrer"
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
                  <LabeledValue label="Original price" value={formatPrice(getOriginalPrice(price))} />
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-ink">Price history</h2>
            <p className="mt-1 text-sm text-slate-600">
              Saved rows are added when a retailer price or promotion changes.
            </p>
          </div>
          <form className="grid gap-2 sm:grid-cols-[150px_220px_auto]" action={`/products/${product.slug}`}>
            <select
              name="historyRetailer"
              defaultValue={historyControls.retailerSlug ?? ""}
              className="h-10 rounded-md border border-teal/20 bg-white px-3 text-sm text-ink"
            >
              <option value="">All retailers</option>
              {retailers.map((retailer) => (
                <option key={retailer.slug} value={retailer.slug}>
                  {retailer.name}
                </option>
              ))}
            </select>
            <input
              name="historyQuery"
              defaultValue={historyControls.query}
              placeholder="Search retailer or promo"
              className="h-10 rounded-md border border-teal/20 bg-white px-3 text-sm text-ink"
            />
            <input type="hidden" name="historySort" value={historyControls.sort} />
            <input type="hidden" name="historyDirection" value={historyControls.direction} />
            <button
              type="submit"
              className="h-10 rounded-md bg-teal px-4 text-sm font-semibold text-white transition hover:bg-teal/90"
            >
              Filter
            </button>
          </form>
        </div>
        {priceHistory.totalRows === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No price history rows match these filters yet.
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
            <div className="min-w-[720px] divide-y divide-teal/10 text-sm">
              <div className="grid grid-cols-[1.1fr_1fr_0.8fr_0.9fr_0.9fr_1.4fr] gap-3 pb-2 text-xs font-semibold uppercase text-slate-500">
                <HistorySortLink controls={historyControls} productSlug={product.slug} label="Date" sort="date" />
                <HistorySortLink controls={historyControls} productSlug={product.slug} label="Retailer" sort="retailer" />
                <HistorySortLink controls={historyControls} productSlug={product.slug} label="Original" sort="shelfPrice" />
                <HistorySortLink controls={historyControls} productSlug={product.slug} label="Deal" sort="dealPrice" />
                <HistorySortLink controls={historyControls} productSlug={product.slug} label="Unit" sort="unitValue" />
                <span>Promotion</span>
              </div>
              {priceHistory.rows.map((price) => (
                <div
                  key={`${price.productSlug}-${price.retailerSlug}-${price.capturedAt}-${price.price}-${price.promotionText ?? ""}`}
                  className="grid grid-cols-[1.1fr_1fr_0.8fr_0.9fr_0.9fr_1.4fr] gap-3 py-3 text-slate-700"
                >
                  <div>
                    <div className="font-medium text-ink">{formatHistoryDate(price.date)}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatCapturedDate(price.capturedAt)}
                    </div>
                  </div>
                  <div className="font-medium text-ink">{price.retailerName}</div>
                  <div>{formatPrice(getOriginalPrice(price))}</div>
                  <div>{formatDealPrice(price)}</div>
                  <div>
                    {price.effectiveUnitPrice !== null
                      ? `$${price.effectiveUnitPrice.toFixed(4)}`
                      : "-"}
                  </div>
                  <div>{price.statusMessage ?? price.promotionText ?? "No promo"}</div>
                </div>
              ))}
            </div>
          </div>
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <div>
                Showing {getPageStart(priceHistory.page, priceHistory.pageSize)}-
                {getPageEnd(priceHistory.page, priceHistory.pageSize, priceHistory.totalRows)} of{" "}
                {priceHistory.totalRows} history rows
              </div>
              <div className="flex gap-2">
                <HistoryPageLink
                  controls={historyControls}
                  productSlug={product.slug}
                  page={priceHistory.page - 1}
                  disabled={priceHistory.page <= 1}
                >
                  Previous
                </HistoryPageLink>
                <HistoryPageLink
                  controls={historyControls}
                  productSlug={product.slug}
                  page={priceHistory.page + 1}
                  disabled={priceHistory.page >= priceHistory.totalPages}
                >
                  Next
                </HistoryPageLink>
              </div>
            </div>
          </>
        )}
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

function formatDealPrice(price: Pick<LatestPrice, "effectivePrice" | "dealQuantity">) {
  if (price.effectivePrice === null) {
    return "-";
  }

  return `$${price.effectivePrice.toFixed(2)}${price.dealQuantity > 1 ? ` x ${price.dealQuantity}` : ""}`;
}

function formatHistoryDate(date: PriceHistory["date"]) {
  return formatDate(date);
}

function formatCapturedDate(capturedAt: string) {
  return `Updated ${formatDate(capturedAt)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function formatPrice(price: number | null) {
  return price !== null ? `$${price.toFixed(2)}` : "-";
}

function getOriginalPrice(price: Pick<LatestPrice, "originalPrice" | "price">) {
  return price.originalPrice ?? price.price;
}

type HistoryControls = {
  retailerSlug?: string;
  query: string;
  sort: WeeklyPriceHistorySort;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};

function getHistoryControls(searchParams: ProductDetailSearchParams | undefined): HistoryControls {
  return {
    retailerSlug: getRetailerSlug(searchParams?.historyRetailer),
    query: searchParams?.historyQuery?.trim() ?? "",
    sort: getHistorySort(searchParams?.historySort),
    direction: searchParams?.historyDirection === "asc" ? "asc" : "desc",
    page: getPositiveInteger(searchParams?.historyPage, 1),
    pageSize: 10
  };
}

function getRetailerSlug(value: string | undefined) {
  return retailers.some((retailer) => retailer.slug === value) ? value : undefined;
}

function getHistorySort(value: string | undefined): WeeklyPriceHistorySort {
  if (
    value === "date" ||
    value === "week" ||
    value === "retailer" ||
    value === "shelfPrice" ||
    value === "dealPrice" ||
    value === "unitValue"
  ) {
    return value;
  }

  return "date";
}

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function HistorySortLink({
  controls,
  productSlug,
  label,
  sort
}: {
  controls: HistoryControls;
  productSlug: string;
  label: string;
  sort: WeeklyPriceHistorySort;
}) {
  const active = controls.sort === sort;
  const direction = active && controls.direction === "asc" ? "desc" : "asc";
  const indicator = active ? (controls.direction === "asc" ? " ↑" : " ↓") : "";

  return (
    <a
      href={getHistoryHref(productSlug, { ...controls, sort, direction, page: 1 })}
      className="text-left transition hover:text-teal"
    >
      {label}
      {indicator}
    </a>
  );
}

function HistoryPageLink({
  controls,
  productSlug,
  page,
  disabled,
  children
}: {
  controls: HistoryControls;
  productSlug: string;
  page: number;
  disabled: boolean;
  children: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-slate-200 px-3 py-2 text-slate-400">
        {children}
      </span>
    );
  }

  return (
    <a
      href={getHistoryHref(productSlug, { ...controls, page })}
      className="rounded-md border border-teal/20 px-3 py-2 font-medium text-teal transition hover:bg-meadow/10"
    >
      {children}
    </a>
  );
}

function getHistoryHref(productSlug: string, controls: HistoryControls) {
  const params = new URLSearchParams();

  if (controls.retailerSlug) {
    params.set("historyRetailer", controls.retailerSlug);
  }
  if (controls.query) {
    params.set("historyQuery", controls.query);
  }
  if (controls.sort !== "date") {
    params.set("historySort", controls.sort);
  }
  if (controls.direction !== "desc") {
    params.set("historyDirection", controls.direction);
  }
  if (controls.page > 1) {
    params.set("historyPage", String(controls.page));
  }

  const query = params.toString();
  return `/products/${productSlug}${query ? `?${query}` : ""}`;
}

function getPageStart(page: number, pageSize: number) {
  return (page - 1) * pageSize + 1;
}

function getPageEnd(page: number, pageSize: number, totalRows: number) {
  return Math.min(page * pageSize, totalRows);
}

function LabeledValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 md:hidden">{label}</div>
      <div className="font-medium text-ink">{value}</div>
    </div>
  );
}
