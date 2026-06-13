DROP TABLE "PromotionDeal";
DROP TABLE "PromotionFlyer";

DROP TYPE "PromotionCategory";
DROP TYPE "PromotionFlyerStatus";
DROP TYPE "PromotionReviewStatus";

CREATE TYPE "FlyerSourceKind" AS ENUM ('DIRECT_PDF', 'PUBLITAS');
CREATE TYPE "FlyerAssetKind" AS ENUM ('PDF', 'PUBLICATION');

CREATE TABLE "FlyerSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "landingUrl" TEXT NOT NULL,
    "kind" "FlyerSourceKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckStatus" TEXT,
    "lastErrorMessage" TEXT,
    "lastMetadataFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlyerSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlyerEdition" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "directPdfUrl" TEXT,
    "storagePath" TEXT,
    "publicationUrl" TEXT,
    "assetKind" "FlyerAssetKind" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlyerEdition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlyerSource_key_key" ON "FlyerSource"("key");
CREATE INDEX "FlyerSource_retailerId_isActive_idx" ON "FlyerSource"("retailerId", "isActive");
CREATE UNIQUE INDEX "FlyerEdition_sourceId_contentHash_key" ON "FlyerEdition"("sourceId", "contentHash");
CREATE INDEX "FlyerEdition_sourceId_firstSeenAt_idx" ON "FlyerEdition"("sourceId", "firstSeenAt");

ALTER TABLE "FlyerSource"
ADD CONSTRAINT "FlyerSource_retailerId_fkey"
FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FlyerEdition"
ADD CONSTRAINT "FlyerEdition_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "FlyerSource"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
