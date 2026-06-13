import { prisma } from "@/lib/db";
import { refreshScheduledData } from "@/lib/pricing/scheduled-refresh";

async function main() {
  const summary = await refreshScheduledData();
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
