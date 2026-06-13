import { prisma } from "@/lib/db";
import { refreshScheduledListings } from "@/lib/pricing/scheduled-refresh";

async function main() {
  const summary = await refreshScheduledListings();
  console.log(JSON.stringify(summary));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Scheduled refresh failed"
    );
    process.exitCode = 1;
  });
