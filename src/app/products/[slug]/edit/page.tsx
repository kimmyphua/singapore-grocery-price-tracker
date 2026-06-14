import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProtectedPage } from "@/lib/auth/guards";
import { getTrackedProductRows } from "@/lib/products/queries";
import { ProductWizard } from "../../new/product-wizard";

export default async function EditProductPage({
  params
}: {
  params: { slug: string };
}) {
  const { profileId } = await requireProtectedPage();
  const [product] = await getTrackedProductRows(undefined, profileId, {
    productSlug: params.slug
  });
  if (!product) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href={`/products/${product.slug}`}
          className="text-sm font-bold text-ink"
        >
          Back to {product.name}
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-ink">
          Add another retailer
        </h1>
        <p className="mt-2 text-slate-600">
          The new listing must match the brand and package size of this
          product.
        </p>
      </div>
      <ProductWizard
        productId={product.id}
        productSlug={product.slug}
        existingProduct={{
          name: product.name,
          brand: product.brand,
          family: product.family,
          flavour: product.flavour,
          packCount: product.packCount,
          unitSize: product.unitSize,
          unit: product.unit,
          totalSize: product.totalSize,
          imageUrl: product.imageUrl
        }}
      />
    </div>
  );
}
