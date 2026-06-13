type ProductClient = {
  trackedProduct: {
    findMany: (args: {
      where: { ownerId: string; isActive: true };
      orderBy: Array<{ brand?: "asc"; name?: "asc" }>;
    }) => Promise<unknown[]>;
  };
};

type PriceClient = {
  priceSnapshot: {
    findMany: (args?: any) => Promise<unknown[]>;
  };
};

type ScrapeRunClient = {
  scrapeRun: {
    create: (args: {
      data: {
        retailer?: { connect: { slug: string } };
        query: string;
        status: "STARTED";
      };
    }) => Promise<unknown>;
  };
};

export async function listProductsPayload(
  client: ProductClient,
  ownerId: string
) {
  const rows = await client.trackedProduct.findMany({
    where: { ownerId, isActive: true },
    orderBy: [{ brand: "asc" }, { name: "asc" }]
  });
  return { products: rows };
}

export async function listLatestPricesPayload(client: PriceClient) {
  try {
    const rows = await client.priceSnapshot.findMany({
      orderBy: { capturedAt: "desc" },
      take: 50,
      include: {
        retailerListing: {
          include: {
            retailer: true,
            canonicalProduct: true
          }
        }
      }
    });
    return { prices: rows };
  } catch {
    return { prices: [], source: "db-unavailable" as const };
  }
}

export async function createScrapeRunPayload(
  client: ScrapeRunClient,
  input: { retailerSlug?: string; query: string }
) {
  const scrapeRun = await client.scrapeRun.create({
    data: {
      ...(input.retailerSlug
        ? { retailer: { connect: { slug: input.retailerSlug } } }
        : {}),
      query: input.query,
      status: "STARTED"
    }
  });

  return { scrapeRun };
}
