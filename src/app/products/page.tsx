import { requireProtectedPage } from "@/lib/auth/guards";
import { getTrackedProductRows } from "@/lib/products/queries";
import Link from "next/link";

export default async function ProductsPage() {
  const { profileId } = await requireProtectedPage();
  const products = await getTrackedProductRows(undefined, profileId);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-ink">
            Tracked products
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Your private list can contain up to 20 products.
          </p>
        </div>
        <Link
          href="/products/new"
          className="inline-flex h-11 items-center justify-center rounded-full bg-peach px-5 text-sm font-bold text-ink"
        >
          Add product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-lilac bg-white p-8 text-center">
          <h2 className="text-xl font-bold text-ink">
            Start your grocery tracker
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Paste a supermarket product URL and check the extracted details.
          </p>
          <Link
            href="/products/new"
            className="mt-4 inline-flex rounded-full bg-peach px-5 py-2 text-sm font-bold text-ink"
          >
            Track your first product
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              className="rounded-2xl border border-sage bg-white p-5 shadow-sm transition hover:border-peach"
            >
              <div className="text-lg font-extrabold text-ink">
                {product.name}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {product.brand} · {formatPack(product)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {product.listings.map(({ retailerListing }) => (
                  <span
                    key={retailerListing.id}
                    className="rounded-full bg-sage/35 px-3 py-1 text-xs font-bold text-ink"
                  >
                    {retailerListing.retailer.name}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function formatPack(product: {
  packCount: number;
  unitSize: number;
  unit: string;
}) {
  return product.packCount > 1
    ? `${product.packCount} x ${product.unitSize}${product.unit}`
    : `${product.unitSize}${product.unit}`;
}
