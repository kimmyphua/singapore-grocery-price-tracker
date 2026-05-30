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

const products = [
  ["magnum-mini-almond-6x55ml", "Magnum", "Ice cream", "Almond", 6, 55, "ml", 330, ["Magnum Mini Almond 6 x 55ml", "Magnum almond ice cream"]],
  ["magnum-almond-3x110ml", "Magnum", "Ice cream", "Almond", 3, 110, "ml", 330, ["Magnum Almond 3 x 110ml", "Magnum almond ice cream sticks 3s"]],
  ["magnum-mini-white-chocolate-6x55ml", "Magnum", "Ice cream", "White Chocolate", 6, 55, "ml", 330, ["Magnum Mini White Chocolate 6 x 55ml", "Magnum white chocolate ice cream sticks 6s"]],
  ["bulla-vanilla-2l", "Bulla", "Ice cream", "Vanilla", 1, 2, "l", 2, ["Bulla vanilla ice cream 2L", "Bulla creamy classics"]],
  ["tillamook-ice-cream-1-42l", "Tillamook", "Ice cream", null, 1, 1.42, "l", 1.42, ["Tillamook ice cream", "Tillamook 1.42L"]]
] as const;

const inactiveProductSlugs = ["kitkat-2-finger-10x15g", "kinder-bueno-3x43g"] as const;

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

  for (const [slug, brand, family, flavour, packCount, unitSize, unit, totalSize, searchTerms] of products) {
    await prisma.canonicalProduct.upsert({
      where: { slug },
      update: { brand, family, flavour, packCount, unitSize, unit, totalSize, searchTerms: [...searchTerms], isActive: true },
      create: { slug, brand, family, flavour, packCount, unitSize, unit, totalSize, searchTerms: [...searchTerms] }
    });
  }

  await prisma.canonicalProduct.updateMany({
    where: { slug: { in: [...inactiveProductSlugs] } },
    data: { isActive: false }
  });
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
