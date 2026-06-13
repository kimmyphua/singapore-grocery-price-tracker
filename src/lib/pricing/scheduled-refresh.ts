import {
  runScheduledRefresh,
  type ListingScraper,
  type SharedListingRefreshStore
} from "@/lib/pricing/refresh-prices";
import { refreshFlyers } from "@/lib/flyers/refresh";

export async function refreshScheduledListings(
  store?: SharedListingRefreshStore,
  scraper?: ListingScraper
) {
  return runScheduledRefresh(store, scraper);
}

export async function refreshScheduledData(
  store?: SharedListingRefreshStore,
  scraper?: ListingScraper
) {
  const prices = await refreshScheduledListings(store, scraper);
  const flyers = await refreshFlyers();
  return { prices, flyers };
}
