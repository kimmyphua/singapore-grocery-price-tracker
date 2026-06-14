export type SupportedProductRetailerSlug =
  | "fairprice"
  | "cold-storage"
  | "redmart"
  | "sheng-siong";

export type SupportedProductUrl = {
  retailerSlug: SupportedProductRetailerSlug;
  canonicalUrl: string;
};

type RetailerUrlRule = {
  retailerSlug: SupportedProductRetailerSlug;
  productPath: RegExp;
};

const RETAILER_URL_RULES: Readonly<Record<string, RetailerUrlRule>> = {
  "www.fairprice.com.sg": {
    retailerSlug: "fairprice",
    productPath: /^\/product\/[a-z0-9]+(?:-[a-z0-9]+)*$/i
  },
  "coldstorage.com.sg": {
    retailerSlug: "cold-storage",
    productPath: /^\/product\/[a-z0-9]+(?:-[a-z0-9]+)*$/i
  },
  "www.lazada.sg": {
    retailerSlug: "redmart",
    productPath:
      /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*-i[0-9]+-s[0-9]+\.html$/i
  },
  "shengsiong.com.sg": {
    retailerSlug: "sheng-siong",
    productPath: /^\/product\/[a-z0-9]+(?:-[a-z0-9]+)*$/i
  }
};

export class UnsupportedProductUrlError extends Error {
  readonly code = "UNSUPPORTED_URL";

  constructor() {
    super("UNSUPPORTED_URL");
    this.name = "UnsupportedProductUrlError";
  }
}

export function parseSupportedProductUrl(input: string): SupportedProductUrl {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new UnsupportedProductUrlError();
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    throw new UnsupportedProductUrlError();
  }

  const rule = RETAILER_URL_RULES[url.hostname.toLowerCase()];
  if (!rule || !rule.productPath.test(url.pathname)) {
    throw new UnsupportedProductUrlError();
  }

  url.hostname = url.hostname.toLowerCase();
  url.search = "";

  return {
    retailerSlug: rule.retailerSlug,
    canonicalUrl: url.toString()
  };
}
