import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const retailers = [
  ["fairprice", "FairPrice", "https://www.fairprice.com.sg"],
  ["sheng-siong", "Sheng Siong", "https://shengsiong.com.sg"],
  ["cold-storage", "Cold Storage", "https://coldstorage.com.sg"],
  ["redmart", "RedMart", "https://redmart.lazada.sg"]
] as const;

const inactiveRetailerSlugs = ["giant"] as const;
const inactiveRetailers = [
  ["giant", "Giant", "https://giant.sg"]
] as const;

async function main() {
  for (const [slug, name, baseUrl] of retailers) {
    await prisma.retailer.upsert({
      where: { slug },
      update: { name, baseUrl, isActive: true },
      create: { slug, name, baseUrl }
    });
  }

  for (const [slug, name, baseUrl] of inactiveRetailers) {
    await prisma.retailer.upsert({
      where: { slug },
      update: { name, baseUrl, isActive: false },
      create: { slug, name, baseUrl, isActive: false }
    });
  }

  for (const slug of inactiveRetailerSlugs) {
    await prisma.retailer.updateMany({
      where: { slug },
      data: { isActive: false }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
