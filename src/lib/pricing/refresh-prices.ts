import { prisma } from "@/lib/db";
import { products } from "@/lib/data/seed-data";
import type { LatestPrice } from "@/lib/data/seed-data";
import { getLiveLatestPrices } from "@/lib/pricing/live-prices";
import { parsePackSize } from "@/lib/products/normalize";

type RefreshPriceClient = {
  retailer: {
    findUnique: (args: any) => Promise<{ id: string } | null>;
  };
  retailerListing: {
    upsert: (args: any) => Promise<{ id: string }>;
  };
  priceSnapshot: {
    create: (args: any) => Promise<unknown>;
  };
};

export async function refreshLatestPrices(options: { productSlug?: string } = {}) {
  const prices = await getLiveLatestPrices(options);
  return storeLatestPrices(prisma as unknown as RefreshPriceClient, prices);
}

export async function storeLatestPrices(client: RefreshPriceClient, prices: LatestPrice[]) {
  let stored = 0;
  let skipped = 0;

  for (const price of prices) {
    if (price.price === null || price.price <= 0) {
      skipped += 1;
      continue;
    }

    const retailer = await client.retailer.findUnique({
      where: { slug: price.retailerSlug },
      select: { id: true }
    });
    if (!retailer) {
      skipped += 1;
      continue;
    }

    const product = products.find((item) => item.slug === price.productSlug);
    const pack = parsePackSize(product?.pack ?? "1");
    const listing = await client.retailerListing.upsert({
      where: {
        retailerId_productUrl: {
          retailerId: retailer.id,
          productUrl: price.productUrl
        }
      },
      update: {
        canonicalProduct: { connect: { slug: price.productSlug } },
        titleRaw: product
          ? [product.brand, product.flavour ?? product.family].filter(Boolean).join(" ")
          : price.productSlug,
        normalizedBrand: product?.brand,
        normalizedFamily: product?.family,
        normalizedFlavour: product?.flavour,
        packCount: pack.packCount,
        unitSize: pack.unitSize,
        unit: pack.unit,
        totalSize: pack.totalSize,
        matchStatus: "AUTO_MATCHED",
        matchConfidence: 1
      },
      create: {
        retailer: { connect: { slug: price.retailerSlug } },
        canonicalProduct: { connect: { slug: price.productSlug } },
        productUrl: price.productUrl,
        titleRaw: product
          ? [product.brand, product.flavour ?? product.family].filter(Boolean).join(" ")
          : price.productSlug,
        brandRaw: product?.brand,
        normalizedBrand: product?.brand,
        normalizedFamily: product?.family,
        normalizedFlavour: product?.flavour,
        packCount: pack.packCount,
        unitSize: pack.unitSize,
        unit: pack.unit,
        totalSize: pack.totalSize,
        matchStatus: "AUTO_MATCHED",
        matchConfidence: 1
      }
    });

    await client.priceSnapshot.create({
      data: {
        retailerListing: { connect: { id: listing.id } },
        price: price.price,
        originalPrice: price.originalPrice,
        unitPrice: price.unitPrice,
        promotionText: price.promotionText,
        currency: "SGD",
        isAvailable: price.isAvailable,
        capturedAt: new Date(price.capturedAt)
      }
    });
    stored += 1;
  }

  return { stored, skipped };
}
