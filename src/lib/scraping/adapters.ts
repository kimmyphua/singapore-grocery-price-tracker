import { fetchRetailerPage } from "./http";
import type { RetailerAdapter, RetailerSlug, ScrapeQuery, ScrapedProduct } from "./types";

type AdapterConfig = {
  slug: RetailerSlug;
  name: string;
  searchUrl: (query: string) => string;
};

function createSearchPageAdapter(config: AdapterConfig): RetailerAdapter {
  return {
    slug: config.slug,
    name: config.name,
    buildSearchUrl: config.searchUrl,
    async search(query: ScrapeQuery): Promise<ScrapedProduct[]> {
      const url = config.searchUrl(query.term);
      await fetchRetailerPage(url);

      // Site-specific selectors or public APIs must be verified per retailer before
      // storing live prices. Returning an empty list keeps the scaffold respectful.
      return [];
    }
  };
}

export const retailerAdapters: RetailerAdapter[] = [
  createSearchPageAdapter({
    slug: "fairprice",
    name: "FairPrice",
    searchUrl: (query) => `https://www.fairprice.com.sg/search?query=${encodeURIComponent(query)}`
  }),
  createSearchPageAdapter({
    slug: "sheng-siong",
    name: "Sheng Siong",
    searchUrl: (query) => `https://shengsiong.com.sg/search?q=${encodeURIComponent(query)}`
  }),
  createSearchPageAdapter({
    slug: "cold-storage",
    name: "Cold Storage",
    searchUrl: (query) => `https://coldstorage.com.sg/search?q=${encodeURIComponent(query)}`
  }),
  createSearchPageAdapter({
    slug: "redmart",
    name: "RedMart",
    searchUrl: (query) => `https://redmart.lazada.sg/catalog/?q=${encodeURIComponent(query)}`
  })
];
