import { prisma } from "@/lib/db";
import { products } from "@/lib/data/seed-data";
import { retailerAdapters } from "./adapters";

const maxResults = Number(process.env.SCRAPER_MAX_RESULTS_PER_QUERY ?? "10");

async function main() {
  for (const adapter of retailerAdapters) {
    for (const product of products) {
      const query = product.searchTerms[0];
      const run = await prisma.scrapeRun.create({
        data: {
          retailer: { connect: { slug: adapter.slug } },
          query,
          status: "STARTED"
        }
      });

      try {
        const results = await adapter.search({ term: query, maxResults });
        await prisma.scrapeRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            itemsFound: results.length,
            itemsStored: 0
          }
        });
      } catch (error) {
        await prisma.scrapeRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : "Unknown scrape error"
          }
        });
      }
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
