import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migrationPath =
  "prisma/migrations/20260611143000_add_multi_user_products/migration.sql";
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const cleanupMigrationPath =
  "prisma/migrations/20260611150000_remove_canonical_products/migration.sql";
const cleanupMigration = existsSync(cleanupMigrationPath)
  ? readFileSync(cleanupMigrationPath, "utf8")
  : "";
const redMartMigrationPath =
  "prisma/migrations/20260620120000_add_redmart_refresh_jobs/migration.sql";
const redMartMigration = existsSync(redMartMigrationPath)
  ? readFileSync(redMartMigrationPath, "utf8")
  : "";
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const seed = readFileSync("prisma/seed.ts", "utf8");

describe("multi-user schema", () => {
  it("defines durable RedMart refresh jobs", () => {
    expect(schema).toContain("enum RedMartRefreshStatus");
    expect(schema).toContain("model RedMartRefreshJob");
    expect(schema).toMatch(/activeKey\s+String\?\s+@unique/);
    expect(schema).toMatch(/attemptCount\s+Int\s+@default\(0\)/);
    expect(schema).toMatch(/leaseExpiresAt\s+DateTime\?/);
    expect(schema).toContain("@@index([status, createdAt])");
    expect(schema).toContain("@@index([listingId, createdAt])");
    expect(
      schema.match(/redMartRefreshJobs\s+RedMartRefreshJob\[\]/g),
    ).toHaveLength(2);

    expect(existsSync(redMartMigrationPath)).toBe(true);
    expect(redMartMigration).toContain(
      'CREATE TYPE "RedMartRefreshStatus" AS ENUM',
    );
    expect(redMartMigration).toContain(
      'CREATE TABLE "RedMartRefreshJob"',
    );
    expect(redMartMigration).toContain(
      'CREATE UNIQUE INDEX "RedMartRefreshJob_activeKey_key"',
    );
    expect(redMartMigration).toContain(
      'ALTER TABLE "RedMartRefreshJob" ENABLE ROW LEVEL SECURITY;',
    );
    expect(redMartMigration).not.toMatch(/\bCREATE\s+POLICY\b/i);
  });

  it("defines private products joined to shared listings", () => {
    expect(schema).toContain("enum AppSessionDuration");
    expect(schema).toContain("enum ScrapeTrigger");
    expect(schema).toContain("enum ScrapeAttemptStatus");
    expect(schema).toContain("model UserProfile");
    expect(schema).toContain("model AppSession");
    expect(schema).toContain("model LoginIntent");
    expect(schema).toMatch(/emailHash\s+String/);
    expect(schema).toMatch(/requesterHash\s+String/);
    expect(schema).toContain("@@index([emailHash, createdAt])");
    expect(schema).toContain("@@index([requesterHash, createdAt])");
    expect(schema).toContain("model TrackedProduct");
    expect(schema).toContain("model TrackedProductListing");
    expect(schema).toContain("model ScrapeAttempt");

    expect(schema).not.toContain("model CanonicalProduct");
    expect(schema).not.toMatch(/canonicalProduct\s+CanonicalProduct\?/);
    expect(schema).not.toMatch(/canonicalProductId\s+String\?/);
    expect(
      schema.match(/trackedProductListings\s+TrackedProductListing\[\]/g),
    ).toHaveLength(2);
    expect(schema).toMatch(/scrapeAttempts\s+ScrapeAttempt\[\]/);

    expect(schema).toContain("@@unique([ownerId, slug])");
    expect(schema).toContain("@@index([ownerId, isActive])");
    expect(schema).toContain("@@unique([trackedProductId, retailerId])");
    expect(schema).toContain("@@unique([trackedProductId, retailerListingId])");
    expect(schema).toContain("@@unique([id, retailerId])");
    expect(schema).toContain("@@index([retailerListingId])");
    expect(schema).toContain("@@index([retailerId])");
    expect(schema).toContain("@@index([retailerListingId, startedAt])");
    expect(schema).toMatch(
      /retailerListing\s+RetailerListing\s+@relation\(fields: \[retailerListingId, retailerId\], references: \[id, retailerId\], onDelete: Restrict\)/,
    );
  });

  it("adds the multi-user tables without removing canonical products", () => {
    expect(existsSync(migrationPath)).toBe(true);

    for (const enumName of [
      "AppSessionDuration",
      "ScrapeTrigger",
      "ScrapeAttemptStatus",
    ]) {
      expect(migration).toContain(`CREATE TYPE "${enumName}" AS ENUM`);
    }

    for (const tableName of [
      "UserProfile",
      "LoginIntent",
      "AppSession",
      "TrackedProduct",
      "TrackedProductListing",
      "ScrapeAttempt",
    ]) {
      expect(migration).toContain(`CREATE TABLE "${tableName}"`);
    }

    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TrackedProduct_ownerId_slug_key"',
    );
    expect(migration).toContain('"emailHash" TEXT NOT NULL');
    expect(migration).toContain('"requesterHash" TEXT NOT NULL');
    expect(migration).toContain(
      'CREATE INDEX "LoginIntent_emailHash_createdAt_idx"',
    );
    expect(migration).toContain(
      'CREATE INDEX "LoginIntent_requesterHash_createdAt_idx"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TrackedProductListing_trackedProductId_retailerId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TrackedProductListing_trackedProductId_retailerListingId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "RetailerListing_id_retailerId_key" ON "RetailerListing"("id", "retailerId");',
    );
    expect(migration).toContain(
      'CREATE INDEX "TrackedProductListing_retailerId_idx" ON "TrackedProductListing"("retailerId");',
    );
    expect(migration).toContain(
      'ALTER TABLE "TrackedProductListing" ADD CONSTRAINT "TrackedProductListing_retailerListingId_retailerId_fkey" FOREIGN KEY ("retailerListingId", "retailerId") REFERENCES "RetailerListing"("id", "retailerId") ON DELETE RESTRICT ON UPDATE CASCADE;',
    );
    expect(migration).toContain(
      'ALTER TABLE "ScrapeAttempt" ADD CONSTRAINT "ScrapeAttempt_retailerListingId_fkey"',
    );

    expect(migration).not.toContain('DROP TABLE "CanonicalProduct"');
    expect(migration).not.toContain('DROP COLUMN "canonicalProductId"');
    expect(migration).not.toContain('UPDATE "RetailerListing"');
  });

  it("removes canonical products only in the post-backfill cleanup migration", () => {
    expect(existsSync(cleanupMigrationPath)).toBe(true);
    expect(cleanupMigration).toContain(
      'ALTER TABLE "RetailerListing" DROP CONSTRAINT "RetailerListing_canonicalProductId_fkey";',
    );
    expect(cleanupMigration).toContain(
      'DROP INDEX "RetailerListing_canonicalProductId_idx";',
    );
    expect(cleanupMigration).toContain(
      'ALTER TABLE "RetailerListing" DROP COLUMN "canonicalProductId";',
    );
    expect(cleanupMigration).toContain('DROP TABLE "CanonicalProduct";');
  });

  it("does not recreate legacy canonical products during seeding", () => {
    expect(seed).not.toContain("canonicalProduct");
    expect(seed).not.toContain("const products");
  });

  it("does not expose the completed one-time legacy migration as a command", () => {
    expect(packageJson.scripts?.["db:migrate-legacy-products"]).toBeUndefined();
  });

  it("enables RLS on every private table without public policies", () => {
    for (const tableName of [
      "UserProfile",
      "LoginIntent",
      "AppSession",
      "TrackedProduct",
      "TrackedProductListing",
      "ScrapeAttempt",
    ]) {
      expect(migration).toContain(
        `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`,
      );
    }

    expect(migration).not.toMatch(/\bCREATE\s+POLICY\b/i);
  });

  it("runs migration behavior checks against PostgreSQL 15 in CI", () => {
    expect(packageJson.scripts?.["test:migrations"]).toBe(
      "vitest run tests/migration-behavior.test.ts",
    );
    expect(ciWorkflow).toContain("image: postgres:15");
    expect(ciWorkflow).toContain(
      "MIGRATION_TEST_DATABASE_URL: postgresql://grocery:grocery@localhost:5432/grocery_price_tracker?schema=public",
    );
    expect(ciWorkflow).toContain("run: npx prisma migrate deploy");
    expect(ciWorkflow).toContain("run: npm run test:migrations");
  });
});
