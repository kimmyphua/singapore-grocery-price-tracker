import {
  runScheduledRefresh,
  type ListingScraper,
  type SharedListingRefreshStore
} from "@/lib/pricing/refresh-prices";

export async function refreshScheduledListings(
  store?: SharedListingRefreshStore,
  scraper?: ListingScraper
) {
  return runScheduledRefresh(store, scraper);
}
