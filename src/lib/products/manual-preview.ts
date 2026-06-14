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
  product?: ExistingProductDetails
): ProductPreview {
  const supportedUrl = parseSupportedProductUrl(input);
  const inputUrl = new URL(input);
  const price = parsePositiveNumber(inputUrl.searchParams.get("price")) ?? 0;
  const details = product ?? EMPTY_PRODUCT_DETAILS;

  return {
    ...details,
    retailerSlug: supportedUrl.retailerSlug,
    canonicalUrl: supportedUrl.canonicalUrl,
    retailerSku: getRetailerSku(supportedUrl.canonicalUrl),
    titleRaw: details.name || "Manual entry",
    price,
    originalPrice: null,
    promotionText: null,
    isAvailable: inputUrl.searchParams.get("stock") !== "0"
  };
}

const EMPTY_PRODUCT_DETAILS: ExistingProductDetails = {
  name: "",
  brand: "",
  family: "",
  flavour: null,
  packCount: 0,
  unitSize: 0,
  unit: "",
  totalSize: 0,
  imageUrl: null
};

function getRetailerSku(canonicalUrl: string): string | undefined {
  const url = new URL(canonicalUrl);
  return (
    url.pathname.match(/-s(\d+)\.html$/i)?.[1] ??
    url.pathname.match(/-(\d{6,})$/)?.[1]
  );
}

function parsePositiveNumber(value: string | null): number | null {
  const number = value ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}
