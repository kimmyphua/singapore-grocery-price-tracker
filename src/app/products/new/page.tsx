import { requireProtectedPage } from "@/lib/auth/guards";
import Link from "next/link";
import { ProductWizard } from "./product-wizard";

export default async function NewProductPage() {
  const { profileId } = await requireProtectedPage();
  void profileId;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/products" className="text-sm font-bold text-ink">
          Back to products
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-ink">
          Track a product
        </h1>
        <p className="mt-2 text-slate-600">
          Start with one retailer URL. You can add another after saving it.
        </p>
      </div>
      <ProductWizard />
    </div>
  );
}
