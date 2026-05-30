export type RetailerSummary = {
  slug: string;
  name: string;
  baseUrl: string;
};

export type ProductSummary = {
  slug: string;
  brand: string;
  family: string;
  flavour: string | null;
  pack: string;
  searchTerms: string[];
};

export type LatestPrice = {
  productSlug: string;
  retailerSlug: string;
  retailerName: string;
  price: number | null;
  unitPrice: number | null;
  effectivePrice: number | null;
  effectiveUnitPrice: number | null;
  dealQuantity: number;
  promotionText: string | null;
  capturedAt: string;
  productUrl: string;
  isAvailable: boolean;
  scrapeStatus: "available" | "unavailable" | "blocked";
  statusMessage: string | null;
  source: "live-product-page" | "cached-price-snapshot";
};

export const retailers: RetailerSummary[] = [
  { slug: "fairprice", name: "FairPrice", baseUrl: "https://www.fairprice.com.sg" },
  { slug: "sheng-siong", name: "Sheng Siong", baseUrl: "https://shengsiong.com.sg" },
  { slug: "cold-storage", name: "Cold Storage", baseUrl: "https://coldstorage.com.sg" },
  { slug: "redmart", name: "RedMart", baseUrl: "https://redmart.lazada.sg" }
];

export const products: ProductSummary[] = [
  {
    slug: "magnum-mini-almond-6x55ml",
    brand: "Magnum",
    family: "Ice cream",
    flavour: "Almond",
    pack: "6 x 55ml",
    searchTerms: ["Magnum Mini Almond 6 x 55ml", "Magnum almond ice cream"]
  },
  {
    slug: "magnum-almond-3x110ml",
    brand: "Magnum",
    family: "Ice cream",
    flavour: "Almond",
    pack: "3 x 110ml",
    searchTerms: ["Magnum Almond 3 x 110ml", "Magnum almond ice cream sticks 3s"]
  },
  {
    slug: "magnum-mini-white-chocolate-6x55ml",
    brand: "Magnum",
    family: "Ice cream",
    flavour: "White Chocolate",
    pack: "6 x 55ml",
    searchTerms: ["Magnum Mini White Chocolate 6 x 55ml", "Magnum white chocolate ice cream sticks 6s"]
  },
  {
    slug: "bulla-vanilla-2l",
    brand: "Bulla",
    family: "Ice cream",
    flavour: "Vanilla",
    pack: "2L",
    searchTerms: ["Bulla vanilla ice cream 2L", "Bulla creamy classics"]
  },
  {
    slug: "tillamook-ice-cream-1-42l",
    brand: "Tillamook",
    family: "Ice cream",
    flavour: null,
    pack: "1.42L",
    searchTerms: ["Tillamook ice cream", "Tillamook 1.42L"]
  }
];
