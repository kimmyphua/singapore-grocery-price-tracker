import { fetchRetailerPage } from "@/lib/scraping/http";
import { parseProductPage } from "@/lib/scraping/parse-product-page";
import type { ParsedRetailerProduct } from "@/lib/scraping/product-page-types";
import { scrapeRedMartBrowserProductPage } from "@/lib/scraping/redmart-browser-page";
import { scrapeShengSiongProductPage } from "@/lib/scraping/sheng-siong-product-page";

type LiveRetailerListing = {
  productUrl: string;
  retailer: {
    slug: string;
  };
};

export async function scrapeLiveRetailerListing(
  listing: LiveRetailerListing
): Promise<ParsedRetailerProduct> {
  if (listing.retailer.slug === "redmart") {
    return scrapeRedMartBrowserProductPage(listing.productUrl);
  }

  if (listing.retailer.slug === "sheng-siong") {
    return scrapeShengSiongProductPage(listing.productUrl);
  }

  const html = await fetchRetailerPage(listing.productUrl);
  return parseProductPage(html, listing.productUrl);
}
