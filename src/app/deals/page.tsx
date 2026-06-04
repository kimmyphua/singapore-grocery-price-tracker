import type { ReactNode } from "react";
import { getApprovedPromotionDeals, getRetailersWithApprovedPromotions } from "@/lib/promotions/queries";
import { RefreshWeeklyDealsButton } from "./refresh-weekly-deals-button";

export const dynamic = "force-dynamic";

type DealsPageProps = {
  searchParams?: {
    category?: string;
    retailer?: string;
  };
};

const CATEGORY_LABELS: Record<string, string> = {
  ICE_CREAM: "Ice cream",
  SNACKS: "Snacks"
};

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const selectedCategory = isCategory(searchParams?.category) ? searchParams?.category : undefined;
  const selectedRetailer = searchParams?.retailer;
  const [retailers, deals] = await Promise.all([
    getRetailersWithApprovedPromotions(),
    getApprovedPromotionDeals({ category: selectedCategory, retailerSlug: selectedRetailer })
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-teal/10 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal">Weekly supermarket flyers</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Snack and ice cream deals</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              These are approved flyer promotions from weekly supermarket ads. OCR matches stay in review first,
              so flyer deals do not change product price comparisons.
            </p>
          </div>
          <RefreshWeeklyDealsButton />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-teal/15 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <FilterLink href="/deals" active={!selectedCategory && !selectedRetailer}>
            All approved
          </FilterLink>
          <FilterLink href={withQuery({ category: "ICE_CREAM", retailer: selectedRetailer })} active={selectedCategory === "ICE_CREAM"}>
            Ice cream
          </FilterLink>
          <FilterLink href={withQuery({ category: "SNACKS", retailer: selectedRetailer })} active={selectedCategory === "SNACKS"}>
            Snacks
          </FilterLink>
        </div>
        <div className="flex flex-wrap gap-2">
          {retailers.map((retailer) => (
            <FilterLink
              key={retailer.slug}
              href={withQuery({ category: selectedCategory, retailer: retailer.slug })}
              active={selectedRetailer === retailer.slug}
            >
              {retailer.name}
            </FilterLink>
          ))}
        </div>
      </section>

      {deals.length === 0 ? (
        <section className="rounded-lg border border-dashed border-teal/25 bg-white p-6">
          <h2 className="font-semibold text-ink">No approved weekly deals yet</h2>
          <p className="mt-2 text-sm text-slate-600">
            Refresh weekly deals, then approve matching snack or ice cream promotions in the review queue.
          </p>
          <a
            href="/admin/promotions"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm font-semibold text-teal"
          >
            Review imported promotions
          </a>
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {deals.map((deal) => (
            <article key={deal.id} className="rounded-lg border border-teal/15 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-teal">
                    {deal.retailer.name}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-ink">{deal.rawTitle}</h2>
                </div>
                <span className="rounded bg-mint/25 px-2 py-1 text-xs font-semibold text-ink">
                  {CATEGORY_LABELS[deal.category]}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="Pack" value={deal.packText ?? "-"} />
                <Info label="Price" value={deal.priceText ?? formatPrice(deal.parsedPrice)} />
                <Info label="Promotion" value={deal.promoText ?? "Flyer price"} wide />
                <Info label="Valid" value={formatDateRange(deal.flyer.validFrom, deal.flyer.validTo)} wide />
              </div>
              <a
                href={deal.flyer.assetUrl}
                className="mt-4 inline-flex text-sm font-semibold text-teal"
                target="_blank"
                rel="noreferrer"
              >
                Open flyer page {deal.pageNumber}
              </a>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function FilterLink({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        active
          ? "rounded-md bg-teal px-3 py-2 text-sm font-semibold text-white"
          : "rounded-md border border-teal/20 px-3 py-2 text-sm font-semibold text-teal"
      }
    >
      {children}
    </a>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-ink">{value}</p>
    </div>
  );
}

function withQuery(query: { category?: string; retailer?: string }) {
  const params = new URLSearchParams();
  if (query.category) {
    params.set("category", query.category);
  }
  if (query.retailer) {
    params.set("retailer", query.retailer);
  }
  const value = params.toString();
  return value ? `/deals?${value}` : "/deals";
}

function isCategory(value: string | undefined): value is "ICE_CREAM" | "SNACKS" {
  return value === "ICE_CREAM" || value === "SNACKS";
}

function formatPrice(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : "-";
}

function formatDateRange(validFrom: Date | null, validTo: Date | null) {
  if (!validFrom && !validTo) {
    return "See flyer";
  }
  const formatter = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" });
  if (validFrom && validTo) {
    return `${formatter.format(validFrom)} to ${formatter.format(validTo)}`;
  }
  return formatter.format(validFrom ?? validTo ?? new Date());
}
