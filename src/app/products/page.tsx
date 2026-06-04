import { products } from "@/lib/data/seed-data";

export default function ProductsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Tracked products</h1>
        <p className="mt-2 text-sm text-slate-600">
          Choose a product to compare saved supermarket prices and current best value.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {products.map((product) => (
          <a
            key={product.slug}
            href={`/products/${product.slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-teal/15 bg-white p-4 shadow-sm transition hover:border-teal"
          >
            <div className="text-lg font-semibold text-ink">
              {product.brand} {product.flavour ?? product.family}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {product.family} · {product.pack}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.searchTerms.map((term) => (
                <span key={term} className="rounded bg-meadow/25 px-2 py-1 text-xs text-slate-700">
                  {term}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
