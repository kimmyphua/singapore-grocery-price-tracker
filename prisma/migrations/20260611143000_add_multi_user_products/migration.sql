-- CreateEnum
CREATE TYPE "AppSessionDuration" AS ENUM ('ONE_DAY', 'THIRTY_DAYS');

-- CreateEnum
CREATE TYPE "ScrapeTrigger" AS ENUM ('ONBOARDING', 'MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "ScrapeAttemptStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED', 'BLOCKED');

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "supabaseUserId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginIntent" (
    "id" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "duration" "AppSessionDuration" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSession" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "supabaseSessionId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedProduct" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "flavour" TEXT,
    "packCount" INTEGER NOT NULL,
    "unitSize" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "totalSize" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedProductListing" (
    "id" TEXT NOT NULL,
    "trackedProductId" TEXT NOT NULL,
    "retailerListingId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedProductListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeAttempt" (
    "id" TEXT NOT NULL,
    "retailerListingId" TEXT NOT NULL,
    "trigger" "ScrapeTrigger" NOT NULL,
    "status" "ScrapeAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "errorCategory" TEXT,
    "errorMessage" TEXT,
    "snapshotStored" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScrapeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_supabaseUserId_key" ON "UserProfile"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_email_key" ON "UserProfile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LoginIntent_nonceHash_key" ON "LoginIntent"("nonceHash");

-- CreateIndex
CREATE INDEX "LoginIntent_expiresAt_idx" ON "LoginIntent"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSession_supabaseSessionId_key" ON "AppSession"("supabaseSessionId");

-- CreateIndex
CREATE INDEX "AppSession_profileId_expiresAt_idx" ON "AppSession"("profileId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedProduct_ownerId_slug_key" ON "TrackedProduct"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "TrackedProduct_ownerId_isActive_idx" ON "TrackedProduct"("ownerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedProductListing_trackedProductId_retailerId_key" ON "TrackedProductListing"("trackedProductId", "retailerId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedProductListing_trackedProductId_retailerListingId_key" ON "TrackedProductListing"("trackedProductId", "retailerListingId");

-- CreateIndex
CREATE INDEX "TrackedProductListing_retailerListingId_idx" ON "TrackedProductListing"("retailerListingId");

-- CreateIndex
CREATE INDEX "ScrapeAttempt_retailerListingId_startedAt_idx" ON "ScrapeAttempt"("retailerListingId", "startedAt");

-- AddForeignKey
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedProduct" ADD CONSTRAINT "TrackedProduct_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedProductListing" ADD CONSTRAINT "TrackedProductListing_trackedProductId_fkey" FOREIGN KEY ("trackedProductId") REFERENCES "TrackedProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedProductListing" ADD CONSTRAINT "TrackedProductListing_retailerListingId_fkey" FOREIGN KEY ("retailerListingId") REFERENCES "RetailerListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedProductListing" ADD CONSTRAINT "TrackedProductListing_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeAttempt" ADD CONSTRAINT "ScrapeAttempt_retailerListingId_fkey" FOREIGN KEY ("retailerListingId") REFERENCES "RetailerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
