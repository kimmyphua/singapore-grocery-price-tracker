import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migrationPath =
  "prisma/migrations/20260611143000_add_multi_user_products/migration.sql";
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("multi-user schema", () => {
  it("defines private products joined to shared listings", () => {
    expect(schema).toContain("enum AppSessionDuration");
    expect(schema).toContain("enum ScrapeTrigger");
    expect(schema).toContain("enum ScrapeAttemptStatus");
    expect(schema).toContain("model UserProfile");
    expect(schema).toContain("model AppSession");
    expect(schema).toContain("model LoginIntent");
    expect(schema).toContain("model TrackedProduct");
    expect(schema).toContain("model TrackedProductListing");
    expect(schema).toContain("model ScrapeAttempt");

    expect(schema).toMatch(/canonicalProduct\s+CanonicalProduct\?/);
    expect(
      schema.match(/trackedProductListings\s+TrackedProductListing\[\]/g),
    ).toHaveLength(2);
    expect(schema).toMatch(/scrapeAttempts\s+ScrapeAttempt\[\]/);

    expect(schema).toContain("@@unique([ownerId, slug])");
    expect(schema).toContain("@@index([ownerId, isActive])");
    expect(schema).toContain("@@unique([trackedProductId, retailerId])");
    expect(schema).toContain("@@unique([trackedProductId, retailerListingId])");
    expect(schema).toContain("@@index([retailerListingId])");
    expect(schema).toContain("@@index([retailerListingId, startedAt])");
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
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TrackedProductListing_trackedProductId_retailerId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TrackedProductListing_trackedProductId_retailerListingId_key"',
    );
    expect(migration).toContain(
      'ALTER TABLE "TrackedProductListing" ADD CONSTRAINT "TrackedProductListing_retailerListingId_fkey"',
    );
    expect(migration).toContain(
      'ALTER TABLE "ScrapeAttempt" ADD CONSTRAINT "ScrapeAttempt_retailerListingId_fkey"',
    );

    expect(migration).not.toContain('DROP TABLE "CanonicalProduct"');
    expect(migration).not.toContain('DROP COLUMN "canonicalProductId"');
    expect(migration).not.toContain('UPDATE "RetailerListing"');
  });
});
