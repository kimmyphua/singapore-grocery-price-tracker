import type { RetailerSlug } from "./types";

export type ParsedRetailerProduct = {
  retailerSlug: RetailerSlug;
  titleRaw: string;
  price: number | null;
  productUrl: string;
  imageUrl?: string;
  isAvailable: boolean;
  retailerSku?: string;
  brandRaw?: string;
  currency?: string;
  promotionText?: string;
  size?: string;
};
