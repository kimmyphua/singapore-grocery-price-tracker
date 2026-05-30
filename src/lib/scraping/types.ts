export type RetailerSlug =
  | "fairprice"
  | "sheng-siong"
  | "cold-storage"
  | "redmart";

export type ScrapeQuery = {
  term: string;
  maxResults: number;
};

export type ScrapedProduct = {
  retailerSlug: RetailerSlug;
  titleRaw: string;
  price: number | null;
  productUrl: string;
  imageUrl?: string;
  promotionText?: string;
  isAvailable: boolean;
};

export type RetailerAdapter = {
  slug: RetailerSlug;
  name: string;
  buildSearchUrl(query: string): string;
  search(query: ScrapeQuery): Promise<ScrapedProduct[]>;
};
