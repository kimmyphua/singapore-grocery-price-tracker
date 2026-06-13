import { prisma } from "@/lib/db";

type FlyerQueryClient = Pick<typeof prisma, "flyerSource" | "flyerEdition">;

export async function getFlyerLibrary(
  client: FlyerQueryClient = prisma,
  now = new Date()
) {
  const cutoff = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
  const sources = await client.flyerSource.findMany({
    where: { isActive: true },
    include: {
      retailer: { select: { name: true } },
      editions: {
        where: { firstSeenAt: { gte: cutoff } },
        orderBy: { firstSeenAt: "desc" }
      }
    },
    orderBy: { title: "asc" }
  });

  return sources.map((source) => ({
    ...source,
    currentEdition: source.editions[0] ?? null
  }));
}

export async function getFlyerEdition(
  id: string,
  client: FlyerQueryClient = prisma
) {
  return client.flyerEdition.findUnique({
    where: { id },
    include: {
      source: {
        include: { retailer: { select: { name: true } } }
      }
    }
  });
}
