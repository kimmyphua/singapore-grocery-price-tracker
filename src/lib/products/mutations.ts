import { Prisma, type PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  compareProductIdentity,
  type ProductIdentity,
  type ProductIdentityConflict
} from "@/lib/products/identity";
import type { ProductPreview } from "@/lib/products/preview";
import { parseSupportedProductUrl } from "@/lib/products/url-policy";
import type { RetailerSlug } from "@/lib/scraping/types";

const PRODUCT_LIMIT = 20;

export type ProductMutationErrorCode =
  | "PRODUCT_FORBIDDEN"
  | "PRODUCT_LIMIT_REACHED"
  | "DUPLICATE_PRODUCT"
  | "DUPLICATE_RETAILER"
  | "INVALID_PRODUCT"
  | "IDENTITY_MISMATCH"
  | "RETAILER_NOT_FOUND";

export class ProductMutationError extends Error {
  constructor(
    readonly code: ProductMutationErrorCode,
    readonly details?: { conflicts?: ProductIdentityConflict[] }
  ) {
    super(code);
    this.name = "ProductMutationError";
  }
}

export type EditableProductFields = {
  name?: string;
  brand?: string;
  family?: string;
  flavour?: string | null;
  packCount?: number;
  unitSize?: number;
  unit?: string;
  totalSize?: number;
  imageUrl?: string | null;
  isActive?: boolean;
};

export const editableProductFieldsSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    brand: z.string().trim().min(1).optional(),
    family: z.string().trim().min(1).optional(),
    flavour: z.string().trim().min(1).nullable().optional(),
    packCount: z.number().int().positive().optional(),
    unitSize: z.number().positive().optional(),
    unit: z.string().trim().min(1).optional(),
    totalSize: z.number().positive().optional(),
    imageUrl: z.string().url().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((fields) => Object.keys(fields).length > 0);

type ProductRecord = ProductIdentity & {
  id: string;
  ownerId: string;
  name: string;
  family: string;
  flavour: string | null;
  unitSize: number;
  imageUrl: string | null;
};

type ProductCreateData = {
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

type ListingUpsertData = {
  retailerId: string;
  canonicalUrl: string;
  preview: ProductPreview;
};

type PendingListingUpsertData = {
  retailerId: string;
  canonicalUrl: string;
  product: ProductRecord;
};

export type ProductMutationStore = {
  transaction<T>(
    operation: (store: ProductMutationStore) => Promise<T>,
    options: { isolationLevel: "Serializable" }
  ): Promise<T>;
  countActiveProducts(ownerId: string): Promise<number>;
  findRetailerBySlug(
    slug: RetailerSlug
  ): Promise<{ id: string; slug: string } | null>;
  createProduct(data: ProductCreateData): Promise<ProductRecord>;
  upsertListing(
    data: ListingUpsertData
  ): Promise<{ id: string; retailerId: string }>;
  upsertPendingListing(
    data: PendingListingUpsertData
  ): Promise<{ id: string; retailerId: string }>;
  createProductListing(data: {
    trackedProductId: string;
    retailerListingId: string;
    retailerId: string;
  }): Promise<void>;
  createSnapshot(data: {
    retailerListingId: string;
    price: number;
    originalPrice: number | null;
    unitPrice: number;
    promotionText: string | null;
    isAvailable: boolean;
  }): Promise<void>;
  createCompletedAttempt(data: {
    retailerListingId: string;
  }): Promise<void>;
  findOwnedProduct(
    id: string,
    ownerId: string
  ): Promise<ProductRecord | null>;
  updateOwnedProduct(
    id: string,
    ownerId: string,
    data: EditableProductFields
  ): Promise<boolean>;
  deleteOwnedProduct(id: string, ownerId: string): Promise<boolean>;
  detachOwnedListing(
    productId: string,
    ownerId: string,
    retailerId: string
  ): Promise<boolean>;
};

export async function createTrackedProduct(
  store: ProductMutationStore = prismaProductMutationStore,
  ownerId: string,
  preview: ProductPreview
) {
  validateProductFields(preview);

  return store.transaction(
    async (transaction) => {
      if ((await transaction.countActiveProducts(ownerId)) >= PRODUCT_LIMIT) {
        throw new ProductMutationError("PRODUCT_LIMIT_REACHED");
      }

      const retailer = await requireRetailer(
        transaction,
        preview.retailerSlug
      );
      let product: ProductRecord;

      try {
        product = await transaction.createProduct({
          ownerId,
          slug: slugify(preview.name),
          name: preview.name,
          brand: preview.brand,
          family: preview.family,
          flavour: preview.flavour,
          packCount: preview.packCount,
          unitSize: preview.unitSize,
          unit: preview.unit,
          totalSize: preview.totalSize,
          imageUrl: preview.imageUrl
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProductMutationError("DUPLICATE_PRODUCT");
        }
        throw error;
      }

      await attachPreview(transaction, product.id, retailer.id, preview);
      return product;
    },
    { isolationLevel: "Serializable" }
  );
}

export async function attachRetailerListing(
  store: ProductMutationStore = prismaProductMutationStore,
  ownerId: string,
  productId: string,
  preview: ProductPreview
): Promise<void> {
  validateProductFields(preview);

  await store.transaction(
    async (transaction) => {
      const product = await transaction.findOwnedProduct(productId, ownerId);
      if (!product) {
        throw new ProductMutationError("PRODUCT_FORBIDDEN");
      }

      const identity = compareProductIdentity(product, preview);
      if (!identity.compatible) {
        throw new ProductMutationError("IDENTITY_MISMATCH", {
          conflicts: identity.conflicts
        });
      }

      const retailer = await requireRetailer(
        transaction,
        preview.retailerSlug
      );
      try {
        await attachPreview(transaction, product.id, retailer.id, preview);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProductMutationError("DUPLICATE_RETAILER");
        }
        throw error;
      }
    },
    { isolationLevel: "Serializable" }
  );
}

export async function attachPendingRetailerListing(
  store: ProductMutationStore = prismaProductMutationStore,
  ownerId: string,
  productId: string,
  inputUrl: string
): Promise<void> {
  let supportedUrl;
  try {
    supportedUrl = parseSupportedProductUrl(inputUrl);
  } catch {
    throw new ProductMutationError("INVALID_PRODUCT");
  }
  if (supportedUrl.retailerSlug !== "redmart") {
    throw new ProductMutationError("INVALID_PRODUCT");
  }

  await store.transaction(
    async (transaction) => {
      const product = await transaction.findOwnedProduct(productId, ownerId);
      if (!product) {
        throw new ProductMutationError("PRODUCT_FORBIDDEN");
      }

      const retailer = await requireRetailer(
        transaction,
        supportedUrl.retailerSlug
      );
      try {
        const listing = await transaction.upsertPendingListing({
          retailerId: retailer.id,
          canonicalUrl: supportedUrl.canonicalUrl,
          product
        });
        await transaction.createProductListing({
          trackedProductId: product.id,
          retailerListingId: listing.id,
          retailerId: retailer.id
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProductMutationError("DUPLICATE_RETAILER");
        }
        throw error;
      }
    },
    { isolationLevel: "Serializable" }
  );
}

export async function updateTrackedProduct(
  store: ProductMutationStore = prismaProductMutationStore,
  ownerId: string,
  productId: string,
  fields: EditableProductFields
): Promise<void> {
  validateEditableFields(fields);
  if (!(await store.updateOwnedProduct(productId, ownerId, fields))) {
    throw new ProductMutationError("PRODUCT_FORBIDDEN");
  }
}

export async function deleteTrackedProduct(
  store: ProductMutationStore = prismaProductMutationStore,
  ownerId: string,
  productId: string
): Promise<void> {
  if (!(await store.deleteOwnedProduct(productId, ownerId))) {
    throw new ProductMutationError("PRODUCT_FORBIDDEN");
  }
}

export async function detachRetailerListing(
  store: ProductMutationStore = prismaProductMutationStore,
  ownerId: string,
  productId: string,
  retailerId: string
): Promise<void> {
  if (
    !(await store.detachOwnedListing(productId, ownerId, retailerId))
  ) {
    throw new ProductMutationError("PRODUCT_FORBIDDEN");
  }
}

export function productMutationErrorResponse(error: unknown) {
  if (!(error instanceof ProductMutationError)) {
    return null;
  }

  const status =
    error.code === "PRODUCT_FORBIDDEN"
      ? 403
      : error.code === "PRODUCT_LIMIT_REACHED" ||
          error.code === "DUPLICATE_PRODUCT" ||
          error.code === "DUPLICATE_RETAILER"
        ? 409
        : 422;

  return NextResponse.json(
    {
      error: error.code,
      ...(error.details ?? {})
    },
    { status }
  );
}

async function attachPreview(
  store: ProductMutationStore,
  productId: string,
  retailerId: string,
  preview: ProductPreview
) {
  const listing = await store.upsertListing({
    retailerId,
    canonicalUrl: preview.canonicalUrl,
    preview
  });
  await store.createProductListing({
    trackedProductId: productId,
    retailerListingId: listing.id,
    retailerId
  });
  await store.createSnapshot({
    retailerListingId: listing.id,
    price: preview.price,
    originalPrice: preview.originalPrice,
    unitPrice: preview.price / preview.totalSize,
    promotionText: preview.promotionText,
    isAvailable: preview.isAvailable
  });
  await store.createCompletedAttempt({ retailerListingId: listing.id });
}

async function requireRetailer(
  store: ProductMutationStore,
  slug: RetailerSlug
) {
  const retailer = await store.findRetailerBySlug(slug);
  if (!retailer) {
    throw new ProductMutationError("RETAILER_NOT_FOUND");
  }
  return retailer;
}

function validateProductFields(preview: ProductPreview) {
  let confirmedUrl;
  try {
    confirmedUrl = parseSupportedProductUrl(preview.canonicalUrl);
  } catch {
    throw new ProductMutationError("INVALID_PRODUCT");
  }

  if (
    confirmedUrl.canonicalUrl !== preview.canonicalUrl ||
    confirmedUrl.retailerSlug !== preview.retailerSlug ||
    !preview.name.trim() ||
    !preview.brand.trim() ||
    !preview.family.trim() ||
    !preview.unit.trim() ||
    preview.packCount <= 0 ||
    preview.unitSize <= 0 ||
    preview.totalSize <= 0 ||
    preview.price <= 0
  ) {
    throw new ProductMutationError("INVALID_PRODUCT");
  }
}

function validateEditableFields(fields: EditableProductFields) {
  if (
    ("name" in fields && !fields.name?.trim()) ||
    ("brand" in fields && !fields.brand?.trim()) ||
    ("family" in fields && !fields.family?.trim()) ||
    ("unit" in fields && !fields.unit?.trim()) ||
    ("packCount" in fields && (!fields.packCount || fields.packCount <= 0)) ||
    ("unitSize" in fields && (!fields.unitSize || fields.unitSize <= 0)) ||
    ("totalSize" in fields && (!fields.totalSize || fields.totalSize <= 0))
  ) {
    throw new ProductMutationError("INVALID_PRODUCT");
  }
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (!slug) {
    throw new ProductMutationError("INVALID_PRODUCT");
  }
  return slug;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

type PrismaProductClient = PrismaClient | Prisma.TransactionClient;

function createPrismaStore(client: PrismaProductClient): ProductMutationStore {
  return {
    transaction(operation, options) {
      if (!("$transaction" in client)) {
        return operation(createPrismaStore(client));
      }
      return client.$transaction(
        (transaction) => operation(createPrismaStore(transaction)),
        { isolationLevel: options.isolationLevel }
      );
    },
    countActiveProducts(ownerId) {
      return client.trackedProduct.count({
        where: { ownerId, isActive: true }
      });
    },
    findRetailerBySlug(slug) {
      return client.retailer.findUnique({
        where: { slug },
        select: { id: true, slug: true }
      });
    },
    createProduct(data) {
      return client.trackedProduct.create({ data });
    },
    upsertListing({ retailerId, canonicalUrl, preview }) {
      const listingData = {
        retailerSku: preview.retailerSku,
        titleRaw: preview.titleRaw,
        brandRaw: preview.brand,
        imageUrl: preview.imageUrl,
        normalizedBrand: preview.brand,
        normalizedFamily: preview.family,
        normalizedFlavour: preview.flavour,
        packCount: preview.packCount,
        unitSize: preview.unitSize,
        unit: preview.unit,
        totalSize: preview.totalSize,
        matchStatus: "AUTO_MATCHED" as const,
        matchConfidence: 1
      };
      return client.retailerListing.upsert({
        where: {
          retailerId_productUrl: {
            retailerId,
            productUrl: canonicalUrl
          }
        },
        create: {
          retailerId,
          productUrl: canonicalUrl,
          ...listingData
        },
        update: listingData,
        select: { id: true, retailerId: true }
      });
    },
    upsertPendingListing({ retailerId, canonicalUrl, product }) {
      const listingData = {
        titleRaw: product.name,
        brandRaw: product.brand,
        imageUrl: product.imageUrl,
        normalizedBrand: product.brand,
        normalizedFamily: product.family,
        normalizedFlavour: product.flavour,
        packCount: product.packCount,
        unitSize: product.unitSize,
        unit: product.unit,
        totalSize: product.totalSize,
        matchStatus: "AUTO_MATCHED" as const,
        matchConfidence: 1
      };
      return client.retailerListing.upsert({
        where: {
          retailerId_productUrl: {
            retailerId,
            productUrl: canonicalUrl
          }
        },
        create: {
          retailerId,
          productUrl: canonicalUrl,
          ...listingData
        },
        update: listingData,
        select: { id: true, retailerId: true }
      });
    },
    async createProductListing(data) {
      await client.trackedProductListing.create({ data });
    },
    async createSnapshot(data) {
      await client.priceSnapshot.create({
        data: {
          ...data,
          currency: "SGD"
        }
      });
    },
    async createCompletedAttempt({ retailerListingId }) {
      const now = new Date();
      await client.scrapeAttempt.create({
        data: {
          retailerListingId,
          trigger: "ONBOARDING",
          status: "COMPLETED",
          snapshotStored: true,
          startedAt: now,
          completedAt: now
        }
      });
    },
    findOwnedProduct(id, ownerId) {
      return client.trackedProduct.findFirst({
        where: { id, ownerId },
        select: {
          id: true,
          ownerId: true,
          name: true,
          brand: true,
          family: true,
          flavour: true,
          packCount: true,
          unitSize: true,
          totalSize: true,
          unit: true,
          imageUrl: true
        }
      });
    },
    async updateOwnedProduct(id, ownerId, data) {
      return (
        (
          await client.trackedProduct.updateMany({
            where: { id, ownerId },
            data
          })
        ).count === 1
      );
    },
    async deleteOwnedProduct(id, ownerId) {
      return (
        (
          await client.trackedProduct.deleteMany({
            where: { id, ownerId }
          })
        ).count === 1
      );
    },
    async detachOwnedListing(productId, ownerId, retailerId) {
      return (
        (
          await client.trackedProductListing.deleteMany({
            where: {
              trackedProductId: productId,
              retailerId,
              trackedProduct: { ownerId }
            }
          })
        ).count === 1
      );
    }
  };
}

export const prismaProductMutationStore = createPrismaStore(prisma);
