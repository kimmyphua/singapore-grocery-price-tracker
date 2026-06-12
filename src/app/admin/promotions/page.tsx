import { RefreshWeeklyDealsButton } from "@/app/deals/refresh-weekly-deals-button";
import { requireProtectedPage } from "@/lib/auth/guards";
import { getPendingPromotionDeals, getPromotionReviewCounts } from "@/lib/promotions/queries";
import { BulkApprovePromotionReviews, PromotionReviewActions } from "./promotion-review-actions";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage({
  searchParams
}: {
  searchParams?: { imported?: string };
}) {
  await requireProtectedPage();
  const [pendingDeals, counts] = await Promise.all([
    getPendingPromotionDeals(),
    getPromotionReviewCounts()
  ]);
  const { approvedCount, rejectedCount } = counts;
  const importedCount = Number(searchParams?.imported);

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-teal/10 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal">Promotion review</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Weekly flyer import queue</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Review OCR candidates before they appear on the public Deals page. Approving a flyer deal does not
              change product shelf prices or best-value calculations.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:min-w-[430px]">
            <RefreshWeeklyDealsButton />
            <BulkApprovePromotionReviews pendingCount={pendingDeals.length} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Pending review" value={pendingDeals.length.toString()} />
        <Metric label="Approved deals" value={approvedCount.toString()} />
        <Metric label="Rejected candidates" value={rejectedCount.toString()} />
      </section>

      {Number.isFinite(importedCount) && importedCount > 0 ? (
        <section className="rounded-lg border border-mint/40 bg-mint/15 p-4">
          <h2 className="font-semibold text-ink">Import ready for review</h2>
          <p className="mt-1 text-sm text-slate-600">
            {importedCount} flyer candidates were added to the review queue. Approve the correct deals to publish
            them on the public Deals page.
          </p>
        </section>
      ) : null}

      {pendingDeals.length === 0 ? (
        <section className="rounded-lg border border-dashed border-teal/25 bg-white p-6">
          <h2 className="font-semibold text-ink">No pending promotions</h2>
          <p className="mt-2 text-sm text-slate-600">
            Refresh weekly deals to fetch supermarket flyers and create new review candidates.
          </p>
          <a
            href="/deals"
            className="mt-4 inline-flex text-sm font-semibold text-teal"
          >
            View approved deals
          </a>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {pendingDeals.map((deal) => (
            <article key={deal.id} className="rounded-lg border border-teal/15 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-teal">
                    {deal.retailer.name} · page {deal.pageNumber}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">{deal.rawTitle}</h2>
                </div>
                <span className="w-fit rounded bg-berry/10 px-2 py-1 text-xs font-semibold text-berry">
                  {Math.round(deal.confidence * 100)}% OCR confidence
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Detail label="Source" value={deal.flyer.title} />
                <Detail label="Category" value={deal.category === "ICE_CREAM" ? "Ice cream" : "Snacks"} />
                <Detail label="Detected price" value={deal.priceText ?? "-"} />
                <Detail label="Promotion" value={deal.promoText ?? "Flyer price"} />
              </dl>
              <a
                href={deal.flyer.assetUrl}
                className="mt-4 inline-flex text-sm font-semibold text-teal"
                target="_blank"
                rel="noreferrer"
              >
                Open source flyer
              </a>
              <PromotionReviewActions
                deal={{
                  id: deal.id,
                  rawTitle: deal.rawTitle,
                  category: deal.category,
                  packText: deal.packText,
                  priceText: deal.priceText,
                  parsedPrice: deal.parsedPrice ? Number(deal.parsedPrice).toString() : "",
                  promoText: deal.promoText
                }}
              />
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-teal/15 bg-white p-4 shadow-sm">
      <div className="text-2xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{label}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-ink">{value}</dd>
    </div>
  );
}
