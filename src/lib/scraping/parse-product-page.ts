import { parseColdStorageProductPage } from "./cold-storage-product-page";
import { parseFairPriceProductPage } from "./fairprice-product-page";
import type { ParsedRetailerProduct } from "./product-page-types";
import { parseRedMartProductPage } from "./redmart-product-page";

export function parseProductPage(html: string, url: string): ParsedRetailerProduct {
  if (url.includes("fairprice.com.sg/product/")) {
    return parseFairPriceProductPage(html, url);
  }

  if (url.includes("lazada.sg/products/")) {
    return parseRedMartProductPage(html, url);
  }

  if (url.includes("coldstorage.com.sg/product/")) {
    return parseColdStorageProductPage(html, url);
  }

  throw new Error("Only FairPrice, RedMart/Lazada, and Cold Storage product URLs are supported");
}
