import type { ProductPreview } from "./preview";
import { parseSupportedProductUrl } from "./url-policy";

export type ExistingProductDetails = Pick<
  ProductPreview,
  | "name"
  | "brand"
  | "family"
  | "flavour"
  | "packCount"
  | "unitSize"
  | "unit"
  | "totalSize"
  | "imageUrl"
>;

export function buildManualRetailerPreview(
  input: string,
  product: ExistingProductDetails
): ProductPreview {
  const supportedUrl = parseSupportedProductUrl(input);
  if (supportedUrl.retailerSlug !== "redmart") {
    throw new Error("MANUAL_FALLBACK_UNSUPPORTED");
  }

  const inputUrl = new URL(input);
  const price = parsePositiveNumber(inputUrl.searchParams.get("price")) ?? 0;
  const retailerSku =
    supportedUrl.canonicalUrl.match(/-s(\d+)\.html$/i)?.[1];

  return {
    ...product,
    retailerSlug: "redmart",
    canonicalUrl: supportedUrl.canonicalUrl,
    retailerSku,
    titleRaw: product.name,
    price,
    originalPrice: null,
    promotionText: null,
    isAvailable: inputUrl.searchParams.get("stock") !== "0"
  };
}

function parsePositiveNumber(value: string | null): number | null {
  const number = value ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}
