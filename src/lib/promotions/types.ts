export type PromotionRetailerSlug =
  | "fairprice"
  | "giant"
  | "sheng-siong"
  | "cold-storage";

export type PromotionAssetKind = "pdf" | "image";

export type PromotionSource = {
  retailerSlug: PromotionRetailerSlug;
  title: string;
  sourceUrl: string;
  assetUrl: string;
  assetKind: PromotionAssetKind;
  validFrom?: Date;
  validTo?: Date;
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
};
