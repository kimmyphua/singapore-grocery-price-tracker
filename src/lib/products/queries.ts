import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const trackedProductQueryArgs =
  Prisma.validator<Prisma.TrackedProductFindManyArgs>()({
    include: {
      listings: {
        include: {
          retailerListing: {
            include: {
              retailer: true,
              priceSnapshots: {
                orderBy: { capturedAt: "desc" },
                take: 500
              },
              scrapeAttempts: {
                orderBy: { startedAt: "desc" },
                take: 1
              },
              redMartRefreshJobs: {
                orderBy: { createdAt: "desc" },
                take: 1
              }
            }
          }
        }
      }
    },
    orderBy: [{ brand: "asc" }, { name: "asc" }]
  });

export type TrackedProductQueryRow =
  Prisma.TrackedProductGetPayload<typeof trackedProductQueryArgs>;

export type TrackedProductQueryClient = {
  trackedProduct: {
    findMany(
      args: Prisma.TrackedProductFindManyArgs
    ): Promise<TrackedProductQueryRow[]>;
  };
};

type TrackedProductQueryOptions = {
  productSlug?: string;
};

export async function getTrackedProductRows(
  client: TrackedProductQueryClient = prisma as unknown as TrackedProductQueryClient,
  ownerId: string,
  options: TrackedProductQueryOptions = {}
): Promise<TrackedProductQueryRow[]> {
  return client.trackedProduct.findMany({
    ...trackedProductQueryArgs,
    where: {
      ownerId,
      isActive: true,
      ...(options.productSlug ? { slug: options.productSlug } : {})
    }
  });
}
