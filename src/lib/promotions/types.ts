export type PromotionRetailerSlug =
  | "fairprice"
  | "giant"
  | "sheng-siong"
  | "cold-storage";

export type PromotionAssetKind = "pdf" | "image";

export type PromotionSeriesKey =
  | "fairprice-weekly-savers"
  | "fairprice-must-buy"
  | "cold-storage-grocery-selections"
  | "giant-super-savings"
  | "sheng-siong-newspaper-advertisement";

export type PromotionParserKind = "fairprice-grid" | "document";

export type PromotionSource = {
  seriesKey: PromotionSeriesKey;
  publicationKey: string;
  retailerSlug: PromotionRetailerSlug;
  title: string;
  sourceUrl: string;
  assetUrl: string;
  assetKind: PromotionAssetKind;
  parserKind: PromotionParserKind;
  pageNumber: number;
  validFrom: Date;
  validTo: Date;
};

export type PromotionDiscoveryFailure = {
  seriesKey: PromotionSeriesKey;
  message: string;
};

export type PromotionDiscoveryResult = {
  sources: PromotionSource[];
  failures: PromotionDiscoveryFailure[];
};

export type PromotionCategory = "SNACKS" | "ICE_CREAM";

export type ExtractedPromotionDeal = {
  category: PromotionCategory;
  rawTitle: string;
  packText: string | null;
  priceText: string | null;
  parsedPrice: number | null;
  promoText: string | null;
  pageNumber: number;
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  confidence: number;
};

export type PromotionTextPage = {
  pageNumber: number;
  text: string;
  items?: PromotionTextItem[];
};

export type PromotionTextItem = {
  str: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  regionId?: string;
};
