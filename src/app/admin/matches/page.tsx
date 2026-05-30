import { products, retailers } from "@/lib/data/seed-data";

export default function MatchReviewPage() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-berry">Internal admin</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">Review supermarket matches</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          This page is for checking whether a supermarket listing is the same product
          before it is trusted for comparison. It is hidden from the main navigation.
        </p>
      </div>
      <div className="rounded-lg border border-teal/15 bg-white shadow-sm">
        <div className="hidden border-b border-teal/10 px-4 py-3 text-sm font-semibold text-slate-600 md:grid md:grid-cols-4">
          <div>Canonical product</div>
          <div>Retailers searched</div>
          <div>Current state</div>
          <div>Next action</div>
        </div>
        <div className="divide-y divide-teal/10">
          {products.map((product) => (
            <div key={product.slug} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-4">
              <div className="font-medium text-ink">
                {product.brand} {product.flavour ?? product.family}
                <div className="text-xs font-normal text-slate-500">{product.pack}</div>
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 md:hidden">Retailers searched</span>
                <div>{retailers.length}</div>
              </div>
              <div>
                <span className="rounded bg-berry/10 px-2 py-1 text-xs font-semibold text-berry">
                  Needs review
                </span>
              </div>
              <div className="text-slate-600">Confirm the listing is the same product.</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
