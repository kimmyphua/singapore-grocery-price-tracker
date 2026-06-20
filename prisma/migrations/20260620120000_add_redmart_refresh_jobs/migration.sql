CREATE TYPE "RedMartRefreshStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "RedMartRefreshJob" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "RedMartRefreshStatus" NOT NULL DEFAULT 'PENDING',
    "activeKey" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "failureCategory" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedMartRefreshJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RedMartRefreshJob_activeKey_key" ON "RedMartRefreshJob"("activeKey");
CREATE INDEX "RedMartRefreshJob_status_createdAt_idx" ON "RedMartRefreshJob"("status", "createdAt");
CREATE INDEX "RedMartRefreshJob_listingId_createdAt_idx" ON "RedMartRefreshJob"("listingId", "createdAt");

ALTER TABLE "RedMartRefreshJob" ADD CONSTRAINT "RedMartRefreshJob_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "RetailerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RedMartRefreshJob" ADD CONSTRAINT "RedMartRefreshJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RedMartRefreshJob" ENABLE ROW LEVEL SECURITY;
