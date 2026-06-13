ALTER TABLE "RetailerListing" DROP CONSTRAINT "RetailerListing_canonicalProductId_fkey";
DROP INDEX "RetailerListing_canonicalProductId_idx";
ALTER TABLE "RetailerListing" DROP COLUMN "canonicalProductId";
DROP TABLE "CanonicalProduct";
