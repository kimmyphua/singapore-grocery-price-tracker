-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('UNMATCHED', 'PENDING_REVIEW', 'AUTO_MATCHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScrapeRunStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PromotionCategory" AS ENUM ('SNACKS', 'ICE_CREAM');

-- CreateEnum
CREATE TYPE "PromotionFlyerStatus" AS ENUM ('IMPORTED', 'PARSE_FAILED');

-- CreateEnum
CREATE TYPE "PromotionReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Retailer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'SG',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalProduct" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "flavour" TEXT,
    "packCount" INTEGER NOT NULL DEFAULT 1,
    "unitSize" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "totalSize" DOUBLE PRECISION NOT NULL,
    "searchTerms" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailerListing" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "canonicalProductId" TEXT,
    "retailerSku" TEXT,
    "titleRaw" TEXT NOT NULL,
    "brandRaw" TEXT,
    "imageUrl" TEXT,
    "productUrl" TEXT NOT NULL,
    "normalizedBrand" TEXT,
    "normalizedFamily" TEXT,
    "normalizedFlavour" TEXT,
    "packCount" INTEGER,
    "unitSize" DOUBLE PRECISION,
    "unit" TEXT,
    "totalSize" DOUBLE PRECISION,
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "retailerListingId" TEXT NOT NULL,
    "scrapeRunId" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "originalPrice" DECIMAL(10,2),
    "unitPrice" DECIMAL(12,5),
    "promotionText" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SGD',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT,
    "status" "ScrapeRunStatus" NOT NULL DEFAULT 'STARTED',
    "query" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsStored" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionFlyer" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "assetUrl" TEXT NOT NULL,
    "assetPath" TEXT NOT NULL,
    "assetHash" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PromotionFlyerStatus" NOT NULL DEFAULT 'IMPORTED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionFlyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionDeal" (
    "id" TEXT NOT NULL,
    "flyerId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "category" "PromotionCategory" NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "packText" TEXT,
    "priceText" TEXT,
    "parsedPrice" DECIMAL(10,2),
    "promoText" TEXT,
    "pageNumber" INTEGER NOT NULL,
    "sourceX" DOUBLE PRECISION,
    "sourceY" DOUBLE PRECISION,
    "sourceWidth" DOUBLE PRECISION,
    "sourceHeight" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reviewStatus" "PromotionReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionDeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Retailer_slug_key" ON "Retailer"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalProduct_slug_key" ON "CanonicalProduct"("slug");

-- CreateIndex
CREATE INDEX "RetailerListing_canonicalProductId_idx" ON "RetailerListing"("canonicalProductId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerListing_retailerId_productUrl_key" ON "RetailerListing"("retailerId", "productUrl");

-- CreateIndex
CREATE INDEX "PriceSnapshot_capturedAt_idx" ON "PriceSnapshot"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionFlyer_assetHash_key" ON "PromotionFlyer"("assetHash");

-- CreateIndex
CREATE INDEX "PromotionFlyer_retailerId_idx" ON "PromotionFlyer"("retailerId");

-- CreateIndex
CREATE INDEX "PromotionFlyer_validFrom_validTo_idx" ON "PromotionFlyer"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "PromotionDeal_reviewStatus_idx" ON "PromotionDeal"("reviewStatus");

-- CreateIndex
CREATE INDEX "PromotionDeal_category_idx" ON "PromotionDeal"("category");

-- CreateIndex
CREATE INDEX "PromotionDeal_retailerId_idx" ON "PromotionDeal"("retailerId");

-- CreateIndex
CREATE INDEX "PromotionDeal_flyerId_idx" ON "PromotionDeal"("flyerId");

-- AddForeignKey
ALTER TABLE "RetailerListing" ADD CONSTRAINT "RetailerListing_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerListing" ADD CONSTRAINT "RetailerListing_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_retailerListingId_fkey" FOREIGN KEY ("retailerListingId") REFERENCES "RetailerListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeRun" ADD CONSTRAINT "ScrapeRun_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionFlyer" ADD CONSTRAINT "PromotionFlyer_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionDeal" ADD CONSTRAINT "PromotionDeal_flyerId_fkey" FOREIGN KEY ("flyerId") REFERENCES "PromotionFlyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionDeal" ADD CONSTRAINT "PromotionDeal_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
