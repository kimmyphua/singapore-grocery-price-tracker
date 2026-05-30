import { prisma } from "@/lib/db";

type PromotionQueryClient = {
  promotionDeal: {
    findMany(args: any): Promise<unknown[]>;
    count?(args: any): Promise<number>;
  };
  retailer?: {
    findMany(args: any): Promise<unknown[]>;
  };
};

export type PromotionDealWithRelations = {
  id: string;
  category: "SNACKS" | "ICE_CREAM";
  rawTitle: string;
  packText: string | null;
  priceText: string | null;
  parsedPrice: unknown;
  promoText: string | null;
  pageNumber: number;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
  flyer: {
    id: string;
    title: string;
    assetUrl: string;
    validFrom: Date | null;
    validTo: Date | null;
  };
  retailer: {
    id: string;
    slug: string;
    name: string;
  };
};

export type PromotionRetailerOption = {
  id: string;
  slug: string;
  name: string;
};

type PublicDealsOptions = {
  category?: "ICE_CREAM" | "SNACKS";
  retailerSlug?: string;
};

export async function getApprovedPromotionDeals(
  options: PublicDealsOptions = {},
  client: PromotionQueryClient = prisma
): Promise<PromotionDealWithRelations[]> {
  const deals = await client.promotionDeal.findMany({
    where: {
      reviewStatus: "APPROVED",
      ...(options.category ? { category: options.category } : {}),
      ...(options.retailerSlug ? { retailer: { slug: options.retailerSlug } } : {})
    },
    include: { flyer: true, retailer: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });
  return deals as PromotionDealWithRelations[];
}

export async function getPendingPromotionDeals(
  client: PromotionQueryClient = prisma
): Promise<PromotionDealWithRelations[]> {
  const deals = await client.promotionDeal.findMany({
    where: { reviewStatus: "PENDING" },
    include: { flyer: true, retailer: true },
    orderBy: [{ createdAt: "desc" }]
  });
  return deals as PromotionDealWithRelations[];
}

export async function getPromotionReviewCounts(client: PromotionQueryClient = prisma) {
  const count = client.promotionDeal.count;
  if (!count) {
    return { approvedCount: 0, rejectedCount: 0 };
  }

  const [approvedCount, rejectedCount] = await Promise.all([
    count({ where: { reviewStatus: "APPROVED" } }),
    count({ where: { reviewStatus: "REJECTED" } })
  ]);
  return { approvedCount, rejectedCount };
}

export async function getRetailersWithApprovedPromotions(
  client: PromotionQueryClient = prisma
): Promise<PromotionRetailerOption[]> {
  if (!client.retailer) {
    return [];
  }

  const retailers = await client.retailer.findMany({
    where: { promotionDeals: { some: { reviewStatus: "APPROVED" } } },
    orderBy: { name: "asc" }
  });
  return retailers as PromotionRetailerOption[];
}
