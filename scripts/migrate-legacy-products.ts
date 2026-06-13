type LegacyProduct = {
  id: string;
  slug: string;
  brand: string;
  family: string;
  flavour: string | null;
  packCount: number;
  unitSize: number;
  unit: string;
  totalSize: number;
  listings: Array<{
    id: string;
    titleRaw?: string;
    imageUrl: string | null;
  }>;
};

type TrackedProductData = {
  ownerId: string;
  slug: string;
  name: string;
  brand: string;
  family: string;
  flavour: string | null;
  packCount: number;
  unitSize: number;
  unit: string;
  totalSize: number;
  imageUrl: string | null;
};

export type LegacyMigrationStore = {
  findOwnerProfiles(email: string): Promise<Array<{ id: string }>>;
  listLegacyProducts(): Promise<LegacyProduct[]>;
  upsertTrackedProduct(
    data: TrackedProductData
  ): Promise<{ id: string; ownerId: string; slug: string }>;
  upsertTrackedProductListing(data: {
    trackedProductId: string;
    retailerListingId: string;
  }): Promise<void>;
};

export async function migrateLegacyProducts(
  store: LegacyMigrationStore,
  ownerEmail: string
) {
  const normalizedEmail = ownerEmail.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("LEGACY_OWNER_EMAIL_REQUIRED");
  }

  const owners = await store.findOwnerProfiles(normalizedEmail);
  if (owners.length === 0) {
    throw new Error("LEGACY_OWNER_NOT_FOUND");
  }
  if (owners.length !== 1) {
    throw new Error("LEGACY_OWNER_NOT_UNIQUE");
  }

  const ownerId = owners[0].id;
  const legacyProducts = await store.listLegacyProducts();
  let listingsProcessed = 0;

  for (const legacy of legacyProducts) {
    const firstListing = legacy.listings[0];
    const product = await store.upsertTrackedProduct({
      ownerId,
      slug: legacy.slug,
      name: firstListing?.titleRaw?.trim() || nameFromSlug(legacy.slug),
      brand: legacy.brand,
      family: legacy.family,
      flavour: legacy.flavour,
      packCount: legacy.packCount,
      unitSize: legacy.unitSize,
      unit: legacy.unit,
      totalSize: legacy.totalSize,
      imageUrl:
        legacy.listings.find((listing) => listing.imageUrl)?.imageUrl ?? null
    });

    for (const listing of legacy.listings) {
      await store.upsertTrackedProductListing({
        trackedProductId: product.id,
        retailerListingId: listing.id
      });
      listingsProcessed += 1;
    }
  }

  return {
    ownerId,
    productsProcessed: legacyProducts.length,
    listingsProcessed
  };
}

function nameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
