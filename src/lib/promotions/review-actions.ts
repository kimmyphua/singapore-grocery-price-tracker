import { prisma } from "@/lib/db";

type PromotionReviewClient = {
  promotionDeal: {
    updateMany(args: {
      where: { reviewStatus: "PENDING" };
      data: { reviewStatus: "APPROVED" };
    }): Promise<{ count: number }>;
  };
};

export async function approvePendingPromotionDeals(
  client: PromotionReviewClient = prisma
) {
  const result = await client.promotionDeal.updateMany({
    where: { reviewStatus: "PENDING" },
    data: { reviewStatus: "APPROVED" }
  });

  return { approvedCount: result.count };
}
