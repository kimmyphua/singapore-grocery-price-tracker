import { requireProtectedPage } from "@/lib/auth/guards";
import { ProductWizard } from "./product-wizard";

export default async function NewProductPage() {
  const { profileId } = await requireProtectedPage();
  void profileId;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <a href="/products" className="text-sm font-bold text-ink">
          Back to products
        </a>
        <h1 className="mt-3 text-3xl font-extrabold text-ink">
          Track a product
        </h1>
        <p className="mt-2 text-slate-600">
          Start with one retailer URL. You can add the same product from other
          retailers later.
        </p>
      </div>
      <ProductWizard />
    </div>
  );
}
